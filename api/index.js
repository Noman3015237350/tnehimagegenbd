const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// In-memory storage (use a database like MongoDB, PostgreSQL in production)
const apiKeys = new Map(); // key -> { expiresAt, createdAt }
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, data] of apiKeys.entries()) {
    if (data.expiresAt && data.expiresAt < now) {
      apiKeys.delete(key);
    }
  }
}, 60000); // Cleanup every minute

// Generate API key
app.get('/api/create-key', (req, res) => {
  const expiredDays = parseInt(req.query.expired) || 30;
  const apiKey = crypto.randomBytes(32).toString('hex');
  
  const expiresAt = Date.now() + (expiredDays * 24 * 60 * 60 * 1000);
  
  apiKeys.set(apiKey, {
    expiresAt,
    createdAt: Date.now(),
    expiredDays
  });
  
  res.json({
    success: true,
    apiKey,
    expiresAt: new Date(expiresAt).toISOString(),
    validDays: expiredDays
  });
});

// Generate image
app.get('/api/gen', async (req, res) => {
  const { APIkey, prompt } = req.query;
  
  if (!APIkey || !prompt) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: APIkey and prompt'
    });
  }
  
  const keyData = apiKeys.get(APIkey);
  
  if (!keyData) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key'
    });
  }
  
  if (keyData.expiresAt && keyData.expiresAt < Date.now()) {
    apiKeys.delete(APIkey);
    return res.status(401).json({
      success: false,
      error: 'API key has expired'
    });
  }
  
  try {
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
    
    // Fetch the image
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Pollinations API returned ${response.status}`);
    }
    
    const imageBuffer = await response.arrayBuffer();
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(imageBuffer));
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate image',
      details: error.message
    });
  }
});

// Get all keys (admin endpoint - consider securing this)
app.get('/api/keys', (req, res) => {
  const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
    apiKey: key.substring(0, 8) + '...', // Mask for security
    expiresAt: new Date(data.expiresAt).toISOString(),
    createdAt: new Date(data.createdAt).toISOString(),
    validDays: data.expiredDays
  }));
  
  res.json({
    success: true,
    total: apiKeys.size,
    keys
  });
});

// Delete API key
app.delete('/api/delete-key', (req, res) => {
  const { apikey } = req.query;
  
  if (!apikey) {
    return res.status(400).json({
      success: false,
      error: 'Missing apikey parameter'
    });
  }
  
  const deleted = apiKeys.delete(apikey);
  
  if (deleted) {
    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'API key not found'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeKeys: apiKeys.size
  });
});

// Export for Vercel
module.exports = app;
