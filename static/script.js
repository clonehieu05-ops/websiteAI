/**
 * AI Hub Total - Frontend JavaScript
 * Handles all UI interactions and API calls
 */

// ============================================
// Configuration & State
// ============================================

const API_BASE = '/api';
let authToken = localStorage.getItem('authToken');
let currentUser = null;

// ============================================
// Utility Functions
// ============================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function setLoading(button, loading) {
    if (loading) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = 'Loading...';
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || button.textContent;
    }
}

function showProgress(containerId, show = true) {
    const container = document.getElementById(containerId);
    if (container) {
        container.classList.toggle('hidden', !show);
        if (show) {
            const fill = container.querySelector('.progress-fill');
            if (fill) {
                fill.style.width = '0%';
                animateProgress(fill);
            }
        }
    }
}

function animateProgress(fill) {
    let width = 0;
    const interval = setInterval(() => {
        if (width >= 90) {
            clearInterval(interval);
        } else {
            width += Math.random() * 10;
            fill.style.width = Math.min(width, 90) + '%';
        }
    }, 500);
    fill.dataset.interval = interval;
}

function completeProgress(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        const fill = container.querySelector('.progress-fill');
        if (fill) {
            clearInterval(fill.dataset.interval);
            fill.style.width = '100%';
            setTimeout(() => container.classList.add('hidden'), 500);
        }
    }
}

async function apiCall(endpoint, options = {}) {
    const headers = {
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

function getCustomApiKey() {
    return document.getElementById('customApiKey')?.value || '';
}

function getCustomHfToken() {
    return document.getElementById('customHfToken')?.value || '';
}

// ============================================
// Authentication
// ============================================

async function updateAuthUI() {
    const authSection = document.getElementById('authSection');
    const userSection = document.getElementById('userSection');

    if (authToken) {
        try {
            currentUser = await apiCall('/auth/me');
            authSection.classList.add('hidden');
            userSection.classList.remove('hidden');

            document.getElementById('userEmail').textContent = currentUser.email;
            document.getElementById('creditsValue').textContent = currentUser.credits.toFixed(0);
            document.getElementById('imageUsage').textContent =
                `${currentUser.usage.image.used}/${currentUser.usage.image.limit}`;
            document.getElementById('videoUsage').textContent =
                `${currentUser.usage.video.used}/${currentUser.usage.video.limit}`;

            if (currentUser.credits > 0) {
                document.getElementById('creditsDisplay').classList.remove('hidden');
                document.getElementById('usageDisplay').classList.add('hidden');
            } else {
                document.getElementById('creditsDisplay').classList.add('hidden');
                document.getElementById('usageDisplay').classList.remove('hidden');
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            logout();
        }
    } else {
        authSection.classList.remove('hidden');
        userSection.classList.add('hidden');
        currentUser = null;
    }
}

async function login(email, password) {
    const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    authToken = data.token;
    localStorage.setItem('authToken', authToken);
    await updateAuthUI();
    showToast('Login successful!', 'success');
}

async function register(email, password) {
    await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    showToast('Registration successful! Please login.', 'success');

    // Switch to login tab
    document.querySelector('[data-tab="login"]').click();
}

function logout() {
    authToken = null;
    localStorage.removeItem('authToken');
    updateAuthUI();
    showToast('Logged out', 'info');
}

async function purchaseCredits(packageId) {
    try {
        const data = await apiCall('/credits/purchase', {
            method: 'POST',
            body: JSON.stringify({ package: packageId })
        });

        showToast(data.message, 'success');
        await updateAuthUI();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================
// Feature Functions
// ============================================

async function generateImage() {
    if (!currentUser) {
        showToast('Please login first', 'warning');
        return;
    }

    const prompt = document.getElementById('imagePrompt').value.trim();
    if (!prompt) {
        showToast('Please enter a prompt', 'warning');
        return;
    }

    const btn = document.getElementById('generateImageBtn');
    setLoading(btn, true);
    showProgress('imageProgress', true);
    document.getElementById('imageResult').classList.add('hidden');

    try {
        const data = await apiCall('/generate/image', {
            method: 'POST',
            body: JSON.stringify({ prompt, api_key: getCustomApiKey() })
        });

        completeProgress('imageProgress');

        const img = document.getElementById('generatedImage');
        img.src = `data:image/png;base64,${data.image}`;
        img.dataset.filename = data.filename;

        document.getElementById('imageResult').classList.remove('hidden');
        await updateAuthUI();
        showToast('Image generated!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
        showProgress('imageProgress', false);
    } finally {
        setLoading(btn, false);
    }
}

async function analyzeImage() {
    if (!currentUser) {
        showToast('Please login first', 'warning');
        return;
    }

    const input = document.getElementById('imageUpload');
    if (!input.files.length) {
        showToast('Please upload an image', 'warning');
        return;
    }

    const btn = document.getElementById('analyzeImageBtn');
    setLoading(btn, true);
    showProgress('promptImageProgress', true);
    document.getElementById('promptImageResult').classList.add('hidden');

    try {
        const formData = new FormData();
        formData.append('image', input.files[0]);
        formData.append('api_key', getCustomApiKey());

        const data = await apiCall('/prompt/image', {
            method: 'POST',
            body: formData
        });

        completeProgress('promptImageProgress');

        document.getElementById('generatedPrompt').value = data.prompt;
        document.getElementById('promptImageResult').classList.remove('hidden');
        await updateAuthUI();
        showToast('Prompt generated!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
        showProgress('promptImageProgress', false);
    } finally {
        setLoading(btn, false);
    }
}

async function analyzeVideo() {
    if (!currentUser) {
        showToast('Please login first', 'warning');
        return;
    }

    const input = document.getElementById('videoUpload');
    if (!input.files.length) {
        showToast('Please upload a video', 'warning');
        return;
    }

    const btn = document.getElementById('analyzeVideoBtn');
    setLoading(btn, true);
    showProgress('promptVideoProgress', true);
    document.getElementById('promptVideoResult').classList.add('hidden');

    try {
        const formData = new FormData();
        formData.append('video', input.files[0]);
        formData.append('api_key', getCustomApiKey());

        const data = await apiCall('/prompt/video', {
            method: 'POST',
            body: formData
        });

        completeProgress('promptVideoProgress');

        document.getElementById('generatedVideoPrompt').value = data.prompt;
        document.getElementById('promptVideoResult').classList.remove('hidden');
        await updateAuthUI();
        showToast('Prompt generated!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
        showProgress('promptVideoProgress', false);
    } finally {
        setLoading(btn, false);
    }
}

async function generateLanding() {
    if (!currentUser) {
        showToast('Please login first', 'warning');
        return;
    }

    const idea = document.getElementById('landingIdea').value.trim();
    if (!idea) {
        showToast('Please describe your idea', 'warning');
        return;
    }

    const btn = document.getElementById('generateLandingBtn');
    setLoading(btn, true);
    showProgress('landingProgress', true);
    document.getElementById('landingResult').classList.add('hidden');

    try {
        const data = await apiCall('/generate/landing', {
            method: 'POST',
            body: JSON.stringify({ idea, api_key: getCustomApiKey() })
        });

        completeProgress('landingProgress');

        const iframe = document.getElementById('landingPreview');
        const code = document.getElementById('landingCode');

        iframe.srcdoc = data.html;
        code.value = data.html;
        code.dataset.filename = data.filename;

        document.getElementById('landingResult').classList.remove('hidden');
        await updateAuthUI();
        showToast('Landing page generated!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
        showProgress('landingProgress', false);
    } finally {
        setLoading(btn, false);
    }
}

async function virtualTryon() {
    if (!currentUser) {
        showToast('Please login first', 'warning');
        return;
    }

    const personInput = document.getElementById('personUpload');
    const clothesInput = document.getElementById('clothesUpload');

    if (!personInput.files.length || !clothesInput.files.length) {
        showToast('Please upload both images', 'warning');
        return;
    }

    const btn = document.getElementById('tryonBtn');
    setLoading(btn, true);
    showProgress('tryonProgress', true);
    document.getElementById('tryonResult').classList.add('hidden');

    try {
        const formData = new FormData();
        formData.append('person', personInput.files[0]);
        formData.append('clothes', clothesInput.files[0]);
        formData.append('description', document.getElementById('garmentDesc').value);
        formData.append('hf_token', getCustomHfToken());

        const data = await apiCall('/tryon', {
            method: 'POST',
            body: formData
        });

        completeProgress('tryonProgress');

        const img = document.getElementById('tryonImage');
        img.src = `data:image/png;base64,${data.image}`;
        img.dataset.filename = data.filename;

        document.getElementById('tryonResult').classList.remove('hidden');
        await updateAuthUI();
        showToast('Virtual try-on complete!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
        showProgress('tryonProgress', false);
    } finally {
        setLoading(btn, false);
    }
}

async function generateVideo() {
    if (!currentUser) {
        showToast('Please login first', 'warning');
        return;
    }

    const prompt = document.getElementById('videoPrompt').value.trim();
    if (!prompt) {
        showToast('Please enter a prompt', 'warning');
        return;
    }

    const btn = document.getElementById('generateVideoBtn');
    setLoading(btn, true);
    showProgress('videoProgress', true);
    document.getElementById('videoResult').classList.add('hidden');

    try {
        const data = await apiCall('/generate/video', {
            method: 'POST',
            body: JSON.stringify({ prompt, hf_token: getCustomHfToken() })
        });

        completeProgress('videoProgress');

        const video = document.getElementById('generatedVideo');
        video.src = `data:video/mp4;base64,${data.video}`;
        video.dataset.filename = data.filename;

        document.getElementById('videoResult').classList.remove('hidden');
        await updateAuthUI();
        showToast('Video generated!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
        showProgress('videoProgress', false);
    } finally {
        setLoading(btn, false);
    }
}

// ============================================
// File Upload Handling
// ============================================

function setupUploadArea(areaId, inputId, previewId, type = 'image') {
    const area = document.getElementById(areaId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (!area || !input) return;

    area.addEventListener('click', () => input.click());

    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('dragover');
    });

    area.addEventListener('dragleave', () => {
        area.classList.remove('dragover');
    });

    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('dragover');

        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            handleFileSelect(input, preview, type);
        }
    });

    input.addEventListener('change', () => {
        handleFileSelect(input, preview, type);
    });
}

function handleFileSelect(input, preview, type) {
    if (!input.files.length || !preview) return;

    const file = input.files[0];
    const url = URL.createObjectURL(file);

    preview.classList.remove('hidden');

    if (type === 'video') {
        preview.src = url;
    } else {
        preview.src = url;
    }

    // Hide upload content
    const content = preview.parentElement.querySelector('.upload-content');
    if (content) content.classList.add('hidden');
}

// ============================================
// Download Functions
// ============================================

function downloadImage(elementId) {
    const img = document.getElementById(elementId);
    if (!img || !img.dataset.filename) return;

    const link = document.createElement('a');
    link.href = img.src;
    link.download = img.dataset.filename;
    link.click();
}

function downloadFile(filename) {
    window.open(`${API_BASE}/download/${filename}`, '_blank');
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    navigator.clipboard.writeText(element.value)
        .then(() => showToast('Copied to clipboard!', 'success'))
        .catch(() => showToast('Failed to copy', 'error'));
}

// ============================================
// Event Listeners
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Check auth on load
    updateAuthUI();

    // Auth tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tab = btn.dataset.tab;
            document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
            document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
        });
    });

    // Login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            await login(email, password);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Register form
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;

        try {
            await register(email, password);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Top up
    document.getElementById('topupBtn').addEventListener('click', () => {
        document.getElementById('packagesMenu').classList.toggle('hidden');
    });

    document.querySelectorAll('.package-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            purchaseCredits(btn.dataset.package);
            document.getElementById('packagesMenu').classList.add('hidden');
        });
    });

    // API settings
    document.getElementById('apiSettingsBtn').addEventListener('click', () => {
        document.getElementById('apiForm').classList.toggle('hidden');
    });

    // Mobile menu
    document.getElementById('menuBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Feature tabs
    document.querySelectorAll('.feature-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.feature-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.feature-panel').forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(tab.dataset.feature).classList.add('active');
        });
    });

    // Generate Image
    document.getElementById('generateImageBtn').addEventListener('click', generateImage);
    document.getElementById('downloadImageBtn')?.addEventListener('click', () => {
        downloadImage('generatedImage');
    });

    // Analyze Image
    setupUploadArea('imageUploadArea', 'imageUpload', 'uploadedImagePreview');
    document.getElementById('analyzeImageBtn').addEventListener('click', analyzeImage);
    document.getElementById('copyPromptBtn')?.addEventListener('click', () => {
        copyToClipboard('generatedPrompt');
    });

    // Analyze Video
    setupUploadArea('videoUploadArea', 'videoUpload', 'uploadedVideoPreview', 'video');
    document.getElementById('analyzeVideoBtn').addEventListener('click', analyzeVideo);
    document.getElementById('copyVideoPromptBtn')?.addEventListener('click', () => {
        copyToClipboard('generatedVideoPrompt');
    });

    // Landing Page
    document.getElementById('generateLandingBtn').addEventListener('click', generateLanding);
    document.getElementById('previewBtn')?.addEventListener('click', () => {
        document.getElementById('landingPreview').classList.remove('hidden');
        document.getElementById('landingCode').classList.add('hidden');
        document.getElementById('previewBtn').classList.add('active');
        document.getElementById('codeBtn').classList.remove('active');
    });
    document.getElementById('codeBtn')?.addEventListener('click', () => {
        document.getElementById('landingPreview').classList.add('hidden');
        document.getElementById('landingCode').classList.remove('hidden');
        document.getElementById('codeBtn').classList.add('active');
        document.getElementById('previewBtn').classList.remove('active');
    });
    document.getElementById('downloadLandingBtn')?.addEventListener('click', () => {
        const code = document.getElementById('landingCode');
        if (code.dataset.filename) {
            downloadFile(code.dataset.filename);
        }
    });

    // Virtual Try-On
    setupUploadArea('personUploadArea', 'personUpload', 'personPreview');
    setupUploadArea('clothesUploadArea', 'clothesUpload', 'clothesPreview');
    document.getElementById('tryonBtn').addEventListener('click', virtualTryon);
    document.getElementById('downloadTryonBtn')?.addEventListener('click', () => {
        downloadImage('tryonImage');
    });

    // Video Generation
    document.getElementById('generateVideoBtn').addEventListener('click', generateVideo);
    document.getElementById('downloadVideoBtn')?.addEventListener('click', () => {
        const video = document.getElementById('generatedVideo');
        if (video.dataset.filename) {
            downloadFile(video.dataset.filename);
        }
    });

    // Close sidebar on outside click (mobile)
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.getElementById('menuBtn');

        if (window.innerWidth <= 768 &&
            sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !menuBtn.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });
});
