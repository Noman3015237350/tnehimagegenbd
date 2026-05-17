// TNEH Image Generator API with Pollinations.ai
// Render.com Optimized Version

const http = require('http');

// In-memory storage
let apiKeys = new Map();

// Helper Functions
function generateApiKey() {
  return "tneh_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10);
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date > new Date();
}

async function generateImageFromPollinations(prompt) {
  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Pollinations image generation failed");
  const imageBuffer = await response.arrayBuffer();
  return {
    success: true,
    imageBase64: Buffer.from(imageBuffer).toString("base64"),
    imageUrl: imageUrl,
  };
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  console.log(`${req.method} ${pathname}`);

  // GET / or /api
  if (pathname === "/" || pathname === "/api") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      name: "TNEH Image Generator API",
      version: "1.0.0",
      status: "Active",
      baseUrl: "https://tnehimagegenbd.onrender.com",
      keysInMemory: apiKeys.size,
      endpoints: {
        "POST /api/create-key": "Create API key - ?expired=30",
        "GET /api/keys": "List all API keys",
        "GET /api/gen": "Generate image (JSON) - ?apikey=KEY&prompt=TEXT",
        "GET /api/gen/image": "Generate image (PNG) - ?apikey=KEY&prompt=TEXT",
        "DELETE /api/revoke-key": "Delete API key - ?apikey=KEY"
      }
    }, null, 2));
  }

  // POST /api/create-key
  if (pathname === "/api/create-key" && req.method === "POST") {
    let expireDate = null;
    
    const expiredDays = url.searchParams.get("expired");
    if (expiredDays && !isNaN(parseInt(expiredDays))) {
      const days = parseInt(expiredDays);
      const date = new Date();
      date.setDate(date.getDate() + days);
      expireDate = date.toISOString().split('T')[0];
    }
    
    if (!expireDate) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      try {
        const data = JSON.parse(body);
        expireDate = data.expireDate || data.expired;
        if (expireDate && !isNaN(parseInt(expireDate))) {
          const date = new Date();
          date.setDate(date.getDate() + parseInt(expireDate));
          expireDate = date.toISOString().split('T')[0];
        }
      } catch(e) {}
    }
    
    if (!expireDate) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "expired parameter required" }));
    }
    
    const apiKey = generateApiKey();
    apiKeys.set(apiKey, {
      promptCount: 0,
      expireDate: expireDate,
      createdAt: new Date().toISOString(),
      lastUsed: null
    });

    res.statusCode = 201;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      success: true,
      apiKey: apiKey,
      expireDate: expireDate,
      totalKeys: apiKeys.size
    }, null, 2));
  }

  // GET /api/keys
  if (pathname === "/api/keys" && req.method === "GET") {
    const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
      key: key,
      keyMasked: key.substring(0, 20) + "...",
      expireDate: data.expireDate,
      promptCount: data.promptCount,
      createdAt: data.createdAt,
      isValid: new Date(data.expireDate) > new Date()
    }));
    
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      totalKeys: apiKeys.size,
      keys: keys
    }, null, 2));
  }

  // DELETE /api/revoke-key
  if (pathname === "/api/revoke-key" && (req.method === "DELETE" || req.method === "GET")) {
    const apikey = url.searchParams.get("apikey");
    
    if (!apikey || !apiKeys.has(apikey)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "API key not found" }));
    }
    
    apiKeys.delete(apikey);
    
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      success: true,
      message: "API key revoked",
      remainingKeys: apiKeys.size
    }, null, 2));
  }

  // GET /api/gen (JSON)
  if (pathname === "/api/gen" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "apikey and prompt required" }));
    }

    if (!apiKeys.has(apikey)) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Invalid API key" }));
    }

    const keyData = apiKeys.get(apikey);
    if (new Date() > new Date(keyData.expireDate)) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "API key expired" }));
    }

    try {
      keyData.promptCount++;
      keyData.lastUsed = new Date().toISOString();
      apiKeys.set(apikey, keyData);

      const result = await generateImageFromPollinations(prompt);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        success: true,
        prompt: prompt,
        imageBase64: result.imageBase64,
        usageCount: keyData.promptCount
      }));
    } catch (error) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "Image generation failed" }));
    }
  }

  // GET /api/gen/image (Direct PNG)
  if (pathname === "/api/gen/image" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      res.statusCode = 400;
      return res.end("Missing apikey or prompt");
    }

    if (!apiKeys.has(apikey)) {
      res.statusCode = 401;
      return res.end("Invalid API key");
    }

    const keyData = apiKeys.get(apikey);
    if (new Date() > new Date(keyData.expireDate)) {
      res.statusCode = 401;
      return res.end("API key expired");
    }

    try {
      keyData.promptCount++;
      keyData.lastUsed = new Date().toISOString();
      apiKeys.set(apikey, keyData);

      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
      const response = await fetch(imageUrl);
      const imageBuffer = await response.arrayBuffer();

      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      return res.end(Buffer.from(imageBuffer));
    } catch (error) {
      res.statusCode = 500;
      return res.end("Image generation failed");
    }
  }

  // 404
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 API URL: https://tnehimagegenbd.onrender.com`);
  console.log(`📊 Total keys in memory: ${apiKeys.size}`);
});
