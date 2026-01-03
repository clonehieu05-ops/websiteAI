"""
AI Hub Total - Flask Backend
REST API for AI image/video generation and editing
"""

import os
import io
import base64
import sqlite3
import tempfile
import time
import uuid
from datetime import datetime, date, timedelta
from functools import wraps
from pathlib import Path

import yaml
import requests
import cv2
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# Google Generative AI
import google.generativeai as genai

# HuggingFace
from huggingface_hub import InferenceClient
from gradio_client import Client, handle_file

# ============================================================================
# APP CONFIGURATION
# ============================================================================

app = Flask(__name__, static_folder='static')
CORS(app)


# Configuration
app.config['SECRET_KEY'] = os.getenv('APP_SECRET_KEY') or 'dev-secret-key-change-in-production'
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY') or 'jwt-secret-key-change-in-production'

# reCAPTCHA configuration (Google reCAPTCHA v2)
# Get your keys at: https://www.google.com/recaptcha/admin
RECAPTCHA_SITE_KEY = os.getenv('RECAPTCHA_SITE_KEY', '6LfIWD4sAAAAAAl15qeamLLcRvljmTvpbFPQfNU7') 
RECAPTCHA_SECRET_KEY = os.getenv('RECAPTCHA_SECRET_KEY', '6LfIWD4sAAAAADacENsqVXIjJuYB3AYr4HBnzQJW')

app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max upload
app.config['UPLOAD_FOLDER'] = 'uploads'

jwt = JWTManager(app)

# Ensure directories exist
os.makedirs('database', exist_ok=True)
os.makedirs('uploads', exist_ok=True)
os.makedirs('outputs', exist_ok=True)

DATABASE_PATH = 'database/users.db'

# Free user limits
FREE_IMAGE_LIMIT = 3
FREE_VIDEO_LIMIT = 3

# Credit packages
CREDIT_PACKAGES = {
    "basic": {"price": 22, "credits": 1000, "name": "Basic"},
    "pro": {"price": 55, "credits": 3000, "name": "Pro"},
    "enterprise": {"price": 110, "credits": 7000, "name": "Enterprise"},
}

# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def get_db():
    """Get database connection."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    """Initialize SQLite database."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_premium INTEGER DEFAULT 0,
            credits REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            feature TEXT NOT NULL,
            usage_date DATE NOT NULL,
            count INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, feature, usage_date)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            package TEXT NOT NULL,
            amount REAL NOT NULL,
            credits INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_database()

# ============================================================================
# API CONFIGURATION
# ============================================================================

def load_secrets():
    """Load API keys from secrets.yaml or environment."""
    secrets = {}
    if os.path.exists("secrets.yaml"):
        with open("secrets.yaml", "r") as f:
            secrets = yaml.safe_load(f) or {}
    
    secrets["GOOGLE_API_KEY"] = os.getenv("GOOGLE_API_KEY", secrets.get("GOOGLE_API_KEY", ""))
    secrets["HUGGINGFACE_API_TOKEN"] = os.getenv("HUGGINGFACE_API_TOKEN", secrets.get("HUGGINGFACE_API_TOKEN", ""))
    return secrets

def configure_gemini(api_key=None):
    """Configure Google Gemini API."""
    secrets = load_secrets()
    key = api_key or secrets.get("GOOGLE_API_KEY", "")
    if key and key != "your_google_api_key_here":
        genai.configure(api_key=key)
        return True
    return False

def get_hf_client(token=None):
    """Get HuggingFace Inference Client."""
    if token:
        return InferenceClient(token=token)
    
    secrets = load_secrets()
    token = secrets.get("HUGGINGFACE_API_TOKEN", "")
    if token and token != "your_huggingface_token_here":
        return InferenceClient(token=token)
    return InferenceClient()

# ============================================================================
# USER HELPER FUNCTIONS
# ============================================================================

def get_user_by_id(user_id):
    """Get user by ID."""
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_usage(user_id, feature):
    """Get today's usage count for a feature."""
    conn = get_db()
    today = date.today().isoformat()
    result = conn.execute(
        "SELECT count FROM usage WHERE user_id = ? AND feature = ? AND usage_date = ?",
        (user_id, feature, today)
    ).fetchone()
    conn.close()
    return result['count'] if result else 0

def increment_usage(user_id, feature):
    """Increment usage count for a feature."""
    conn = get_db()
    today = date.today().isoformat()
    conn.execute('''
        INSERT INTO usage (user_id, feature, usage_date, count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(user_id, feature, usage_date) 
        DO UPDATE SET count = count + 1
    ''', (user_id, feature, today))
    conn.commit()
    conn.close()

def deduct_credits(user_id, amount=1.0):
    """Deduct credits from user account."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?",
        (amount, user_id, amount)
    )
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def check_usage_limit(user_id, feature, limit):
    """Check if user can use a feature."""
    user = get_user_by_id(user_id)
    if not user:
        return False, "User not found"
    
    if user['credits'] > 0:
        return True, None
    
    usage = get_user_usage(user_id, feature)
    if usage >= limit:
        return False, f"Daily limit reached ({limit}). Upgrade to premium for unlimited access!"
    
    return True, None

def consume_usage(user_id, feature):
    """Record usage for a feature."""
    user = get_user_by_id(user_id)
    if user['credits'] > 0:
        deduct_credits(user_id, 1.0)
    else:
        increment_usage(user_id, feature)

# ============================================================================
# AI FUNCTIONS
# ============================================================================

def generate_image_gemini(prompt, api_key=None):
    """Generate image using Gemini 2.0 Flash."""
    try:
        if not configure_gemini(api_key):
            return None, "Please configure Google API key"
        
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        
        response = model.generate_content(
            f"Generate an image: {prompt}",
            generation_config=genai.GenerationConfig(
                response_mime_type="image/png"
            )
        )
        
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    return part.inline_data.data, None
        
        return None, "No image generated"
        
    except Exception as e:
        return None, str(e)

def describe_image_gemini(image_data, api_key=None):
    """Describe an image using Gemini Vision."""
    try:
        if not configure_gemini(api_key):
            return None, "Please configure Google API key"
        
        model = genai.GenerativeModel('gemini-2.0-flash')
        image = Image.open(io.BytesIO(image_data))
        
        prompt = """Analyze this image in detail and create an enhanced prompt for AI image generation. Include:
        1. Main subject and composition
        2. Art style and technique
        3. Colors and lighting
        4. Mood and atmosphere
        5. Background and environment
        
        Format as a single, detailed image generation prompt."""
        
        response = model.generate_content([prompt, image])
        return response.text, None
        
    except Exception as e:
        return None, str(e)

def extract_video_frames(video_path, max_frames=5):
    """Extract key frames from video."""
    frames = []
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        return None, "Could not open video"
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    duration = total_frames / fps if fps > 0 else 0
    
    if duration > 15:
        cap.release()
        return None, "Video exceeds 15 seconds limit"
    
    interval = max(1, total_frames // max_frames)
    
    for i in range(0, total_frames, interval):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ret, frame = cap.read()
        if ret:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(frame_rgb)
            frames.append(pil_image)
            if len(frames) >= max_frames:
                break
    
    cap.release()
    return frames, None

def describe_video_frames(frames, api_key=None):
    """Analyze video frames and generate prompt."""
    try:
        if not configure_gemini(api_key):
            return None, "Please configure Google API key"
        
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        prompt = """Analyze these video frames and create a detailed prompt for AI video generation. Include:
        1. Main action/movement
        2. Subject description
        3. Visual style
        4. Scene/environment
        5. Mood and pacing
        
        Format as a single video generation prompt."""
        
        content = [prompt] + frames
        response = model.generate_content(content)
        return response.text, None
        
    except Exception as e:
        return None, str(e)

def generate_landing_page(idea, api_key=None):
    """Generate complete landing page HTML/CSS/JS."""
    try:
        if not configure_gemini(api_key):
            return None, "Please configure Google API key"
        
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        prompt = f"""Create a complete, modern, responsive landing page for: {idea}

        Requirements:
        - Single HTML file with embedded CSS and JavaScript
        - Modern, beautiful design with gradients and animations
        - Fully responsive (mobile-first)
        - Include hero section, features, CTA buttons
        - Use modern CSS (flexbox, grid, custom properties)
        - Smooth scroll and micro-interactions
        - Professional typography (use Google Fonts)
        
        Return ONLY the complete HTML code, no explanations."""
        
        response = model.generate_content(prompt)
        
        text = response.text
        if "```html" in text:
            text = text.split("```html")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        
        return text.strip(), None
        
    except Exception as e:
        return None, str(e)

def virtual_tryon(person_path, clothes_path, garment_desc="", api_key=None):
    """Virtual try-on using IDM-VTON."""
    try:
        if api_key:
            client = Client("yisol/IDM-VTON", hf_token=api_key)
        else:
            client = Client("yisol/IDM-VTON")
        
        result = client.predict(
            dict={"background": handle_file(person_path), "layers": [], "composite": None},
            garm_img=handle_file(clothes_path),
            garment_des=garment_desc or "A piece of clothing",
            is_checked=True,
            is_checked_crop=False,
            denoise_steps=30,
            seed=42,
            api_name="/tryon"
        )
        
        if result and isinstance(result, (list, tuple)):
            result_path = result[0] if isinstance(result[0], str) else result[0]
            if os.path.exists(str(result_path)):
                with open(result_path, 'rb') as f:
                    return f.read(), None
        
        return None, "Virtual try-on failed"
        
    except Exception as e:
        return None, str(e)

def generate_video_hf(prompt, api_key=None):
    """Generate video using HuggingFace."""
    try:
        client = get_hf_client(api_key)
        result = client.text_to_video(prompt, model="ali-vilab/text-to-video-ms-1.7b")
        
        if result:
            return result, None
        return None, "Video generation failed"
        
    except Exception as e:
        return None, str(e)

# ============================================================================
# API ROUTES - AUTH
# ============================================================================

@app.route('/')
def index():
    """Serve main page."""
    return send_from_directory('static', 'index.html')


@app.route('/api/recaptcha-key', methods=['GET'])
def get_recaptcha_key():
    """Return reCAPTCHA site key for frontend."""
    return jsonify({"siteKey": RECAPTCHA_SITE_KEY})

def verify_recaptcha(token):
    """Verify reCAPTCHA token with Google."""
    if not token:
        return False
    try:
        response = requests.post(
            'https://www.google.com/recaptcha/api/siteverify',
            data={
                'secret': RECAPTCHA_SECRET_KEY,
                'response': token
            },
            timeout=5
        )
        result = response.json()
        return result.get('success', False)
    except:
        return False

def is_valid_email(email):
    """Check if email is a valid Gmail address."""
    if not email:
        return False
    email = email.lower().strip()
    # Only allow @gmail.com addresses
    return email.endswith('@gmail.com')

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register new user."""
    data = request.json
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    captcha_token = data.get('captchaToken', '')
    
    # Verify reCAPTCHA
    if not verify_recaptcha(captcha_token):
        return jsonify({"error": "Please complete the CAPTCHA verification"}), 400
    
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    
    # Check for Gmail only
    if not is_valid_email(email):
        return jsonify({"error": "Only @gmail.com email addresses are allowed"}), 400
    
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (email, generate_password_hash(password))
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Registration successful"}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Email already exists"}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login user."""
    data = request.json
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    captcha_token = data.get('captchaToken', '')
    
    # Verify reCAPTCHA
    if not verify_recaptcha(captcha_token):
        return jsonify({"error": "Please complete the CAPTCHA verification"}), 400
    
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Invalid email or password"}), 401
    
    access_token = create_access_token(identity=str(user['id']))
    return jsonify({
        "token": access_token,
        "user": {
            "id": user['id'],
            "email": user['email'],
            "is_premium": bool(user['is_premium']),
            "credits": user['credits']
        }
    })

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info."""
    try:
        user_id = get_jwt_identity()
        print(f"DEBUG: /auth/me requested for user_id={user_id} (type: {type(user_id)})")
        
        user = get_user_by_id(user_id)
        
        if not user:
            print(f"DEBUG: User {user_id} not found in DB")
            return jsonify({"error": "User not found"}), 404
    
    # Get usage stats
    img_usage = get_user_usage(user_id, "image")
    vid_usage = get_user_usage(user_id, "video")
    
    return jsonify({
        "id": user['id'],
        "email": user['email'],
        "is_premium": bool(user['is_premium']),
        "credits": user['credits'],
        "usage": {
            "image": {"used": img_usage, "limit": FREE_IMAGE_LIMIT},
            "video": {"used": vid_usage, "limit": FREE_VIDEO_LIMIT}
        }
    })

# ============================================================================
# API ROUTES - CREDITS
# ============================================================================

@app.route('/api/credits/packages', methods=['GET'])
def get_packages():
    """Get available credit packages."""
    return jsonify(CREDIT_PACKAGES)

@app.route('/api/credits/purchase', methods=['POST'])
@jwt_required()
def purchase_credits():
    """Simulate credit purchase."""
    user_id = get_jwt_identity()
    data = request.json
    package_id = data.get('package', '')
    
    if package_id not in CREDIT_PACKAGES:
        return jsonify({"error": "Invalid package"}), 400
    
    package = CREDIT_PACKAGES[package_id]
    
    conn = get_db()
    conn.execute(
        "UPDATE users SET credits = credits + ?, is_premium = 1 WHERE id = ?",
        (package['credits'], user_id)
    )
    conn.execute(
        "INSERT INTO transactions (user_id, package, amount, credits) VALUES (?, ?, ?, ?)",
        (user_id, package_id, package['price'], package['credits'])
    )
    conn.commit()
    conn.close()
    
    user = get_user_by_id(user_id)
    return jsonify({
        "message": f"Added {package['credits']} credits!",
        "credits": user['credits']
    })

# ============================================================================
# API ROUTES - AI FEATURES
# ============================================================================

@app.route('/api/generate/image', methods=['POST'])
@jwt_required()
def api_generate_image():
    """Generate image from prompt."""
    user_id = get_jwt_identity()
    
    can_use, error = check_usage_limit(user_id, "image", FREE_IMAGE_LIMIT)
    if not can_use:
        return jsonify({"error": error}), 403
    
    data = request.json
    prompt = data.get('prompt', '')
    api_key = data.get('api_key')
    
    if not prompt:
        return jsonify({"error": "Prompt required"}), 400
    
    image_data, error = generate_image_gemini(prompt, api_key)
    
    if error:
        return jsonify({"error": error}), 500
    
    consume_usage(user_id, "image")
    
    # Save and return
    filename = f"generated_{uuid.uuid4().hex[:8]}.png"
    filepath = os.path.join('outputs', filename)
    with open(filepath, 'wb') as f:
        f.write(image_data)
    
    return jsonify({
        "image": base64.b64encode(image_data).decode(),
        "filename": filename
    })

@app.route('/api/prompt/image', methods=['POST'])
@jwt_required()
def api_prompt_from_image():
    """Generate prompt from uploaded image."""
    user_id = get_jwt_identity()
    
    can_use, error = check_usage_limit(user_id, "image", FREE_IMAGE_LIMIT)
    if not can_use:
        return jsonify({"error": error}), 403
    
    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
    
    file = request.files['image']
    image_data = file.read()
    api_key = request.form.get('api_key')
    
    prompt, error = describe_image_gemini(image_data, api_key)
    
    if error:
        return jsonify({"error": error}), 500
    
    consume_usage(user_id, "image")
    return jsonify({"prompt": prompt})

@app.route('/api/prompt/video', methods=['POST'])
@jwt_required()
def api_prompt_from_video():
    """Generate prompt from uploaded video."""
    user_id = get_jwt_identity()
    
    can_use, error = check_usage_limit(user_id, "video", FREE_VIDEO_LIMIT)
    if not can_use:
        return jsonify({"error": error}), 403
    
    if 'video' not in request.files:
        return jsonify({"error": "No video uploaded"}), 400
    
    file = request.files['video']
    api_key = request.form.get('api_key')
    
    # Save temporarily
    temp_path = os.path.join('uploads', f"temp_{uuid.uuid4().hex[:8]}.mp4")
    file.save(temp_path)
    
    frames, error = extract_video_frames(temp_path)
    os.unlink(temp_path)
    
    if error:
        return jsonify({"error": error}), 400
    
    prompt, error = describe_video_frames(frames, api_key)
    
    if error:
        return jsonify({"error": error}), 500
    
    consume_usage(user_id, "video")
    return jsonify({"prompt": prompt})

@app.route('/api/generate/landing', methods=['POST'])
@jwt_required()
def api_generate_landing():
    """Generate landing page."""
    user_id = get_jwt_identity()
    
    can_use, error = check_usage_limit(user_id, "image", FREE_IMAGE_LIMIT)
    if not can_use:
        return jsonify({"error": error}), 403
    
    data = request.json
    idea = data.get('idea', '')
    api_key = data.get('api_key')
    
    if not idea:
        return jsonify({"error": "Idea required"}), 400
    
    html_code, error = generate_landing_page(idea, api_key)
    
    if error:
        return jsonify({"error": error}), 500
    
    consume_usage(user_id, "image")
    
    # Save file
    filename = f"landing_{uuid.uuid4().hex[:8]}.html"
    filepath = os.path.join('outputs', filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html_code)
    
    return jsonify({
        "html": html_code,
        "filename": filename
    })

@app.route('/api/tryon', methods=['POST'])
@jwt_required()
def api_virtual_tryon():
    """Virtual try-on clothes swap."""
    user_id = get_jwt_identity()
    
    can_use, error = check_usage_limit(user_id, "image", FREE_IMAGE_LIMIT)
    if not can_use:
        return jsonify({"error": error}), 403
    
    if 'person' not in request.files or 'clothes' not in request.files:
        return jsonify({"error": "Both person and clothes images required"}), 400
    
    person_file = request.files['person']
    clothes_file = request.files['clothes']
    garment_desc = request.form.get('description', '')
    api_key = request.form.get('hf_token')
    
    # Save temporarily
    person_path = os.path.join('uploads', f"person_{uuid.uuid4().hex[:8]}.png")
    clothes_path = os.path.join('uploads', f"clothes_{uuid.uuid4().hex[:8]}.png")
    
    person_file.save(person_path)
    clothes_file.save(clothes_path)
    
    result_data, error = virtual_tryon(person_path, clothes_path, garment_desc, api_key)
    
    # Cleanup
    os.unlink(person_path)
    os.unlink(clothes_path)
    
    if error:
        return jsonify({"error": error}), 500
    
    consume_usage(user_id, "image")
    
    # Save result
    filename = f"tryon_{uuid.uuid4().hex[:8]}.png"
    filepath = os.path.join('outputs', filename)
    with open(filepath, 'wb') as f:
        f.write(result_data)
    
    return jsonify({
        "image": base64.b64encode(result_data).decode(),
        "filename": filename
    })

@app.route('/api/generate/video', methods=['POST'])
@jwt_required()
def api_generate_video():
    """Generate video from prompt."""
    user_id = get_jwt_identity()
    
    can_use, error = check_usage_limit(user_id, "video", FREE_VIDEO_LIMIT)
    if not can_use:
        return jsonify({"error": error}), 403
    
    data = request.json
    prompt = data.get('prompt', '')
    api_key = data.get('hf_token')
    
    if not prompt:
        return jsonify({"error": "Prompt required"}), 400
    
    video_data, error = generate_video_hf(prompt, api_key)
    
    if error:
        return jsonify({"error": error}), 500
    
    consume_usage(user_id, "video")
    
    # Save video
    filename = f"video_{uuid.uuid4().hex[:8]}.mp4"
    filepath = os.path.join('outputs', filename)
    with open(filepath, 'wb') as f:
        f.write(video_data)
    
    return jsonify({
        "video": base64.b64encode(video_data).decode(),
        "filename": filename
    })

@app.route('/api/download/<filename>')
def download_file(filename):
    """Download generated file."""
    return send_from_directory('outputs', filename, as_attachment=True)

# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    app.run(debug=True, port=5000)
