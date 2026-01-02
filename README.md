# AI Hub Total - Web Application

A comprehensive AI-powered web application for image/video generation and editing.

## Features

- 🖼️ **Image Generation** - Generate images using Google Gemini AI
- 📝 **Prompt from Image** - Extract and enhance prompts from uploaded images
- 🎬 **Prompt from Video** - Generate prompts from video content (max 15s)
- 🌐 **Landing Page Generator** - Create complete HTML/CSS/JS landing pages
- 👔 **Virtual Try-On** - AI-powered clothes swap using IDM-VTON
- 🎥 **Video Generation** - Text-to-video generation with HuggingFace models

## Tech Stack

- **Backend**: Flask (Python)
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Database**: SQLite
- **Authentication**: JWT
- **AI APIs**: Google Gemini, HuggingFace

## Prerequisites

- Python 3.9+
- Google AI Studio API key (free)
- HuggingFace API token (free)

## Installation

1. **Navigate to the project directory:**
   ```bash
   cd d:\tool\coder\project
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure API keys:**
   ```bash
   copy secrets.yaml.example secrets.yaml
   ```
   Edit `secrets.yaml` and add your API keys:
   - Get Google API key: https://aistudio.google.com/apikey
   - Get HuggingFace token: https://huggingface.co/settings/tokens

## Running the Application

```bash
python app.py
```

Open your browser and go to: **http://localhost:5000**

## Project Structure

```
project/
├── app.py                 # Flask backend (REST API)
├── requirements.txt       # Python dependencies
├── secrets.yaml           # API keys (create from example)
├── secrets.yaml.example   # API keys template
├── README.md              # This file
├── static/
│   ├── index.html         # Main HTML page
│   ├── styles.css         # CSS stylesheet
│   └── script.js          # JavaScript frontend
├── database/
│   └── users.db           # SQLite database (auto-created)
├── uploads/               # Temporary uploads (auto-created)
└── outputs/               # Generated files (auto-created)
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info

### Credits
- `GET /api/credits/packages` - List credit packages
- `POST /api/credits/purchase` - Purchase credits

### AI Features
- `POST /api/generate/image` - Generate image from prompt
- `POST /api/prompt/image` - Extract prompt from image
- `POST /api/prompt/video` - Extract prompt from video
- `POST /api/generate/landing` - Generate landing page
- `POST /api/tryon` - Virtual try-on
- `POST /api/generate/video` - Generate video from prompt

## User Tiers

### Free Users
- 3 image generations per day
- 3 video generations per day
- Access to all features with daily limits

### Premium Users
- Unlimited usage (credits-based)
- Credit packages:
  - Basic: $22 for 1000 credits
  - Pro: $55 for 3000 credits
  - Enterprise: $110 for 7000 credits

## Deployment

### Production Server (Gunicorn)
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

## License

MIT License
