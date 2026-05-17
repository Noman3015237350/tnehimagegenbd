# 🎨 AI Image Generation API

A complete backend API for AI-powered image generation with API key management system, integrated with Telegram bot for payment and key distribution.

## 🚀 Features

- ✅ **API Key Management** - Create, validate, and expire API keys
- ✅ **Image Generation** - Generate AI images using Pollinations.ai
- ✅ **Telegram Bot Integration** - Sell API keys via Telegram with payment system
- ✅ **Auto-expiry** - Keys automatically expire after set duration
- ✅ **Easy Deployment** - Deploy to Vercel in minutes

## 📋 Table of Contents

- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Installation](#installation)
- [Deployment](#deployment)
- [Telegram Bot Setup](#telegram-bot-setup)
- [Usage Examples](#usage-examples)
- [Environment Variables](#environment-variables)
- [Database Options](#database-options)

## 🏗 Architecture

```

Telegram Bot → Vercel API → Pollinations.ai → Image Response
↓
API Key Management
↓
Memory/DB Storage

```

## 🔌 API Endpoints

### 1. Create API Key
```http
GET /api/create-key?expired={days}
```

Response:

```json
{
  "success": true,
  "apiKey": "abc123def456...",
  "expiresAt": "2024-12-31T23:59:59.999Z",
  "validDays": 30
}
```

2. Generate Image

```http
GET /api/gen?APIkey={key}&prompt={text}
```

Response: Image (JPEG) or Error JSON

3. List All Keys (Admin)

```http
GET /api/keys
```

Response:

```json
{
  "success": true,
  "total": 5,
  "keys": [
    {
      "apiKey": "abc123...xyz",
      "expiresAt": "2024-12-31T00:00:00.000Z",
      "validDays": 30
    }
  ]
}
```

4. Delete API Key

```http
DELETE /api/delete-key?apikey={key}
```

5. Health Check

```http
GET /api/health
```

📦 Installation

Prerequisites

· Node.js 18+ or Bun
· Vercel CLI (for deployment)
· Telegram Bot Token (from @BotFather)

Local Development

1. Clone the repository

```bash
git clone https://github.com/yourusername/image-gen-api.git
cd image-gen-api
```

1. Install dependencies

```bash
npm install
```

1. Run locally

```bash
npm run dev
# or
vercel dev
```

1. Test endpoints

```bash
# Create API key
curl "http://localhost:3000/api/create-key?expired=30"

# Generate image
curl "http://localhost:3000/api/gen?APIkey=YOUR_KEY&prompt=beautiful cat" --output image.jpg
```

🚀 Deployment to Vercel

Method 1: Using Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# For production
vercel --prod
```

Method 2: GitHub Integration

1. Push code to GitHub
2. Go to Vercel
3. Import your repository
4. Deploy automatically on every push

Environment Variables (Optional)

```env
# In Vercel Dashboard → Settings → Environment Variables
DATABASE_URL=your_database_url  # If using external DB
ADMIN_ID=8128648817              # Telegram admin ID
```

🤖 Telegram Bot Setup

1. Create Bot on Telegram

1. Message @BotFather
2. Send /newbot
3. Choose name: Image Gen Bot
4. Get your bot token

2. Configure Bot Code

```javascript
// Replace in telegram bot code
var admin = 8128648817;  // Your Telegram ID
var botToken = "YOUR_BOT_TOKEN_HERE";
```

3. Bot Commands

Command Description Access
/start Main menu All users
/buy Purchase API key All users
/gen [prompt] Generate image Users with key
/status Check key status All users
/confirm [user_id] Confirm payment Admin only
/users List all users Admin only
/broadcast [msg] Broadcast message Admin only

4. Payment Setup

Update payment info in the code:

```javascript
// Change this to your bKash/Nagad number
"bKash/Nagad: `01869325625`\n\n"
```

💻 Usage Examples

JavaScript/Node.js

```javascript
// Generate image with API key
async function generateImage(apiKey, prompt) {
  const response = await fetch(
    `https://yourdomain.vercel.app/api/gen?APIkey=${apiKey}&prompt=${encodeURIComponent(prompt)}`
  );
  
  if (response.ok) {
    const buffer = await response.buffer();
    // Save or process image
    require('fs').writeFileSync('image.jpg', buffer);
  }
}
```

Python

```python
import requests

def generate_image(api_key, prompt):
    url = f"https://yourdomain.vercel.app/api/gen"
    params = {
        "APIkey": api_key,
        "prompt": prompt
    }
    
    response = requests.get(url, params=params)
    
    if response.status_code == 200:
        with open("image.jpg", "wb") as f:
            f.write(response.content)
        return True
    return False

# Usage
generate_image("your_api_key", "beautiful sunset")
```

cURL

```bash
# Create key
curl "https://yourdomain.vercel.app/api/create-key?expired=30"

# Generate image
curl "https://yourdomain.vercel.app/api/gen?APIkey=YOUR_KEY&prompt=cute%20cat" --output cat.jpg

# List keys (admin)
curl "https://yourdomain.vercel.app/api/keys"

# Delete key
curl -X DELETE "https://yourdomain.vercel.app/api/delete-key?apikey=YOUR_KEY"
```

📊 Database Options

Current (In-Memory)

⚠️ Pros: Simple, no setup
⚠️ Cons: Data lost on restart

Recommended for Production

1. Vercel KV (Redis)

```javascript
import { kv } from '@vercel/kv';

// Save
await kv.set(`key:${apiKey}`, userData);
// Retrieve
const data = await kv.get(`key:${apiKey}`);
```

2. MongoDB Atlas

```javascript
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGODB_URI);
```

3. Supabase (PostgreSQL)

```javascript
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
```

4. Google Sheets (Free)

```javascript
// Save keys to Google Sheets for admin view
```

🔒 Security Best Practices

1. Rate Limiting

```javascript
// Add rate limiting to prevent abuse
const rateLimit = new Map();
// Implement in API
```

1. Validate API Keys

```javascript
// Always check expiry
if (keyData.expiresAt < Date.now()) {
  return res.status(401).json({ error: 'Key expired' });
}
```

1. Use Environment Variables

```javascript
// Never hardcode secrets
const ADMIN_ID = process.env.ADMIN_ID;
```

🐛 Troubleshooting

Common Issues

Issue: 404 - Not Found
Solution: Check Vercel routes in vercel.json

Issue: CORS error
Solution: Headers already configured in vercel.json

Issue: API key invalid
Solution: Check key expiry date and storage

Issue: Image not generating
Solution: Verify Pollinations.ai is accessible

📝 Project Structure

```
├── api/
│   └── index.js          # Main API handler
├── telegram/
│   └── bot.js            # Telegram bot code
├── vercel.json           # Vercel configuration
├── package.json          # Dependencies
├── .env.example          # Environment variables
└── README.md             # Documentation
```

🛠 Tech Stack

· Runtime: Node.js 18+
· Framework: Express.js
· Hosting: Vercel (Serverless)
· Image API: Pollinations.ai
· Bot Platform: Telegram Bot API
· Storage: In-memory / Optional DB

📈 Pricing Calculator

Package Days Price (BDT) Price (USD)
Basic 7 49 BDT ~$0.45
Standard 30 120 BDT ~$1.10
Premium 60 199 BDT ~$1.85

🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open Pull Request

📄 License

MIT License - Free for personal and commercial use

📞 Support

· Telegram: @admin
· Issues: GitHub Issues
· Email: support@yourdomain.com

🌟 Live Demo

API Base URL: https://tnehimagegenbd.vercel.app/api

Test Endpoint:

```bash
curl "https://tnehimagegenbd.vercel.app/api/health"
```

---

🚀 Quick Deploy Button

https://vercel.com/button

---

Made with ❤️ by [Your Name] | © 2024
