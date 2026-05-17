// api/index.js - Compatible with Vercel serverless functions
const crypto = require('crypto');

// In-memory storage (use database in production)
const apiKeys = new Map();

// Cleanup expired keys every hour
if (!global.cleanupInterval) {
  global.cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of apiKeys.entries()) {
      if (data.expiresAt && data.expiresAt < now) {
        apiKeys.delete(key);
      }
    }
  }, 3600000);
  global.apiKeys = apiKeys;
}

// Helper function for JSON responses
const sendJSON = (res, statusCode, data) => {
  res.status(statusCode).json(data);
};

// Helper to handle CORS
const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

module.exports = async (req, res) => {
  // Set CORS headers
  setCORSHeaders(res);
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Route: Create API Key
  if (pathname === '/api/create-key' && req.method === 'GET') {
    const expiredDays = parseInt(url.searchParams.get('expired')) || 30;
    const apiKey = crypto.randomBytes(32).toString('hex');
    
    const expiresAt = Date.now() + (expiredDays * 24 * 60 * 60 * 1000);
    
    apiKeys.set(apiKey, {
      expiresAt,
      createdAt: Date.now(),
      expiredDays
    });
    
    return sendJSON(res, 200, {
      success: true,
      apiKey,
      expiresAt: new Date(expiresAt).toISOString(),
      validDays: expiredDays
    });
  }
  
  // Route: Generate Image
  if (pathname === '/api/gen' && req.method === 'GET') {
    const APIkey = url.searchParams.get('APIkey');
    const prompt = url.searchParams.get('prompt');
    
    if (!APIkey || !prompt) {
      return sendJSON(res, 400, {
        success: false,
        error: 'Missing required parameters: APIkey and prompt'
      });
    }
    
    const keyData = apiKeys.get(APIkey);
    
    if (!keyData) {
      return sendJSON(res, 401, {
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (keyData.expiresAt && keyData.expiresAt < Date.now()) {
      apiKeys.delete(APIkey);
      return sendJSON(res, 401, {
        success: false,
        error: 'API key has expired'
      });
    }
    
    try {
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
      
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`Pollinations API returned ${response.status}`);
      }
      
      const imageBuffer = await response.arrayBuffer();
      
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(Buffer.from(imageBuffer));
      
    } catch (error) {
      return sendJSON(res, 500, {
        success: false,
        error: 'Failed to generate image',
        details: error.message
      });
    }
  }
  
  // Route: List all keys (masked)
  if (pathname === '/api/keys' && req.method === 'GET') {
    const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
      apiKey: key.substring(0, 8) + '...' + key.substring(key.length - 4),
      expiresAt: new Date(data.expiresAt).toISOString(),
      createdAt: new Date(data.createdAt).toISOString(),
      validDays: data.expiredDays
    }));
    
    return sendJSON(res, 200, {
      success: true,
      total: apiKeys.size,
      keys
    });
  }
  
  // Route: Delete API key
  if (pathname === '/api/delete-key' && (req.method === 'DELETE' || req.method === 'GET')) {
    const apikey = url.searchParams.get('apikey');
    
    if (!apikey) {
      return sendJSON(res, 400, {
        success: false,
        error: 'Missing apikey parameter'
      });
    }
    
    const deleted = apiKeys.delete(apikey);
    
    if (deleted) {
      return sendJSON(res, 200, {
        success: true,
        message: 'API key deleted successfully'
      });
    } else {
      return sendJSON(res, 404, {
        success: false,
        error: 'API key not found'
      });
    }
  }
  
  // Route: Health check
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJSON(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      activeKeys: apiKeys.size
    });
  }
  
  // 404 for unknown routes
  return sendJSON(res, 404, {
    success: false,
    error: 'Endpoint not found'
  });
};
