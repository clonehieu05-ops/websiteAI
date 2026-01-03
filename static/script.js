/**
 * AI Hub Total - Frontend JavaScript
 * Modern Dashboard Version
 */

// ============================================
// Global State
// ============================================

const API_BASE = '/api';
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let loginCaptchaId = null;
let registerCaptchaId = null;
const SITE_KEY = '6LfIWD4sAAAAAAl15qeamLLcRvljmTvpbFPQfNU7'; // Test Key

// ============================================
// Utility Functions
// ============================================

// Global function for reCAPTCHA callback
window.onCaptchaLoad = function () {
    try {
        if (document.getElementById('loginCaptcha')) {
            loginCaptchaId = grecaptcha.render('loginCaptcha', {
                'sitekey': SITE_KEY,
                'theme': 'dark'
            });
        }

        if (document.getElementById('registerCaptcha')) {
            registerCaptchaId = grecaptcha.render('registerCaptcha', {
                'sitekey': SITE_KEY,
                'theme': 'dark'
            });
        }
        console.log('CAPTCHA loaded explicitly', { loginCaptchaId, registerCaptchaId });
    } catch (e) {
        console.error('CAPTCHA load error:', e);
    }
};

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
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = '<span class="btn-icon">⏳</span> Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || button.innerHTML;
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
// Navigation
// ============================================

function switchSection(sectionName) {
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // Update sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.toggle('active', section.id === `${sectionName}-section`);
    });

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
}

// ============================================
// Authentication
// ============================================

async function updateAuthUI() {
    const userDropdown = document.getElementById('userDropdown');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const dropdownEmail = document.getElementById('dropdownEmail');
    const userAvatar = document.getElementById('userAvatar');

    if (authToken) {
        try {
            currentUser = await apiCall('/auth/me');

            dropdownEmail.textContent = currentUser.email;
            userAvatar.textContent = currentUser.email[0].toUpperCase();
            loginBtn.classList.add('hidden');
            registerBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');

            // Update stats
            if (currentUser.usage) {
                document.getElementById('statImages').textContent = currentUser.usage.image.used;
                document.getElementById('statVideos').textContent = currentUser.usage.video.used;
                document.getElementById('imageLimit').textContent = currentUser.usage.image.limit;
                document.getElementById('videoLimit').textContent = currentUser.usage.video.limit;
            }
            if (currentUser.credits !== undefined) {
                document.getElementById('statCredits').textContent = Math.floor(currentUser.credits);
            }

        } catch (error) {
            console.error('Auth check failed:', error);
            logout();
        }
    } else {
        dropdownEmail.textContent = 'Guest';
        userAvatar.textContent = '?';
        loginBtn.classList.remove('hidden');
        registerBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        currentUser = null;

        // Reset stats
        document.getElementById('statImages').textContent = '0';
        document.getElementById('statVideos').textContent = '0';
        document.getElementById('statCredits').textContent = '0';
    }
}

function showAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    modal.classList.remove('hidden');

    // Switch tab
    document.querySelectorAll('.modal-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
}

function hideAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
}

async function login(email, password) {
    if (loginCaptchaId === null) {
        throw new Error('CAPTCHA not initialized. Please refresh page.');
    }

    // Get reCAPTCHA token using specific widget ID
    const captchaToken = grecaptcha.getResponse(loginCaptchaId);
    if (!captchaToken) {
        throw new Error('Please complete the CAPTCHA verification');
    }

    const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, captchaToken })
    });

    authToken = data.token;
    localStorage.setItem('authToken', authToken);
    await updateAuthUI();
    hideAuthModal();
    grecaptcha.reset(loginCaptchaId); // Reset specific captcha
    showToast('Welcome back!', 'success');
}

async function register(email, password) {
    // Validate Gmail
    if (!email.toLowerCase().endsWith('@gmail.com')) {
        throw new Error('Only @gmail.com addresses are allowed');
    }

    // Get reCAPTCHA token using specific widget ID
    if (registerCaptchaId === null) {
        throw new Error('CAPTCHA not initialized. Please refresh page.');
    }

    const captchaToken = grecaptcha.getResponse(registerCaptchaId);
    if (!captchaToken) {
        throw new Error('Please complete the CAPTCHA verification');
    }

    await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, captchaToken })
    });

    grecaptcha.reset(registerCaptchaId); // Reset specific captcha
    showToast('Account created! Please login.', 'success');
    showAuthModal('login');
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
        showAuthModal();
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
        showAuthModal();
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
        showAuthModal();
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
        showAuthModal();
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
        showAuthModal();
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
        showAuthModal();
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
            handleFileSelect(input, preview, area, type);
        }
    });

    input.addEventListener('change', () => {
        handleFileSelect(input, preview, area, type);
    });
}

function handleFileSelect(input, preview, area, type) {
    if (!input.files.length || !preview) return;

    const file = input.files[0];
    const url = URL.createObjectURL(file);

    preview.classList.remove('hidden');
    preview.src = url;

    // Hide upload content
    const content = area.querySelector('.upload-content');
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
    try {
        updateAuthUI();
        console.log("System initialized");
    } catch (e) {
        console.error("Init failed:", e);
    }

    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            if (section) {
                switchSection(section);
            }
        });
    });

    // Feature cards
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('click', () => {
            const feature = card.dataset.feature;
            if (feature) {
                switchSection(feature);
            }
        });
    });

    // Mobile menu toggle
    document.getElementById('menuBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // User menu dropdown
    document.getElementById('userAvatar').addEventListener('click', () => {
        document.getElementById('userDropdown').classList.toggle('hidden');
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const userMenu = document.getElementById('userMenu');
        const dropdown = document.getElementById('userDropdown');
        if (!userMenu.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Auth buttons
    document.getElementById('loginBtn').addEventListener('click', () => showAuthModal('login'));
    document.getElementById('registerBtn').addEventListener('click', () => showAuthModal('register'));
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Auth modal
    document.getElementById('closeModal').addEventListener('click', hideAuthModal);
    document.querySelector('.modal-overlay').addEventListener('click', hideAuthModal);

    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.modal-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === tabName);
            });
            document.getElementById('loginForm').classList.toggle('hidden', tabName !== 'login');
            document.getElementById('registerForm').classList.toggle('hidden', tabName !== 'register');
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

    // Top up button
    document.getElementById('topupBtn').addEventListener('click', () => {
        switchSection('settings');
    });

    // Package buttons
    document.querySelectorAll('.package-card button').forEach(btn => {
        btn.addEventListener('click', () => {
            const packageId = btn.closest('.package-card').dataset.package;
            purchaseCredits(packageId);
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

    // Save API Keys
    document.getElementById('saveApiKeysBtn')?.addEventListener('click', () => {
        showToast('API keys saved for this session', 'success');
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
