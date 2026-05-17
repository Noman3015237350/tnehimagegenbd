const crypto = require('crypto');

// In production, use a real database. This is for demo purposes.
let apiKeys = new Map(); // key -> { promptCount, expireDate, createdAt }

// Helper functions
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

function isKeyValid(apiKey) {
  const keyData = apiKeys.get(apiKey);
  if (!keyData) return false;
  
  const now = new Date();
  const expireDate = new Date(keyData.expireDate);
  
  return now <= expireDate;
}

// Main generation endpoint
async function generateImage(prompt, apiKey) {
  // Validate API key
  if (!apiKey || !isKeyValid(apiKey)) {
    throw new Error('Invalid or expired API key');
  }
  
  // Update usage count
  const keyData = apiKeys.get(apiKey);
  keyData.promptCount++;
  apiKeys.set(apiKey, keyData);
  
  // Encode prompt for URL
  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
  
  // Fetch and return the image
  const response = await fetch(imageUrl);
  const imageBuffer = await response.arrayBuffer();
  
  return {
    success: true,
    image: Buffer.from(imageBuffer).toString('base64'),
    prompt: prompt,
    remainingRequests: 'Unlimited',
    expireDate: keyData.expireDate
  };
}

// Express-like handler for Vercel/Hercules/Netlify
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  
  // Create API Key endpoint
  if (path === '/api/create-key' && req.method === 'POST') {
    let body = {};
    try {
      body = JSON.parse(req.body || '{}');
    } catch(e) {}
    
    const { expireDate } = body;
    
    if (!expireDate || !isValidDate(expireDate)) {
      return res.status(400).json({ 
        error: 'Valid expireDate is required (YYYY-MM-DD format)' 
      });
    }
    
    const apiKey = generateApiKey();
    apiKeys.set(apiKey, {
      promptCount: 0,
      expireDate: expireDate,
      createdAt: new Date().toISOString()
    });
    
    return res.status(200).json({
      success: true,
      apiKey: apiKey,
      expireDate: expireDate,
      endpoint: `https://tnehimagegenbd.onhercules.app/api/gen?apikey=${apiKey}&prompt=your_prompt_here`
    });
  }
  
  // Generate image endpoint (JSON response)
  if (path === '/api/gen' && req.method === 'GET') {
    const { apikey, prompt } = url.searchParams;
    
    if (!apikey || !prompt) {
      return res.status(400).json({ 
        error: 'Missing required parameters: apikey and prompt' 
      });
    }
    
    try {
      const result = await generateImage(prompt, apikey);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(401).json({ 
        error: error.message,
        validKeys: Array.from(apiKeys.keys()).length
      });
    }
  }
  
  // Generate image endpoint (direct binary)
  if (path === '/api/gen/image' && req.method === 'GET') {
    const { apikey, prompt } = url.searchParams;
    
    if (!apikey || !prompt) {
      return res.status(400).send('Missing apikey or prompt');
    }
    
    if (!isKeyValid(apikey)) {
      return res.status(401).send('Invalid or expired API key');
    }
    
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
    
    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(Buffer.from(imageBuffer));
  }
  
  // List keys (admin only)
  if (path === '/api/keys' && req.method === 'GET') {
    const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
      key: key.substring(0, 8) + '...',
      expireDate: data.expireDate,
      promptCount: data.promptCount,
      createdAt: data.createdAt
    }));
    return res.status(200).json({ 
      totalKeys: keys.length,
      keys: keys 
    });
  }
  
  // Root endpoint with API info
  if (path === '/' || path === '/api') {
    return res.status(200).json({
      name: 'TNEH Image Generator API',
      version: '1.0.0',
      endpoints: {
        createKey: 'POST /api/create-key',
        generateImage: 'GET /api/gen?apikey=KEY&prompt=TEXT',
        generateImageDirect: 'GET /api/gen/image?apikey=KEY&prompt=TEXT',
        listKeys: 'GET /api/keys'
      },
      docs: 'https://tnehimagegenbd.onhercules.app/'
    });
  }
  
  return res.status(404).json({ error: 'Endpoint not found' });
};
