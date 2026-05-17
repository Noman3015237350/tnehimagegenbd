// TNEH Image Generator API with Pollinations.ai
// Live at: https://tnehimagegenbd.vercel.app

// In-memory storage
let apiKeys = new Map();

// Helper Functions
function generateApiKey() {
  return "tneh_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date > new Date();
}

function isKeyValid(apiKey) {
  const keyData = apiKeys.get(apiKey);
  if (!keyData) return false;
  const now = new Date();
  const expireDate = new Date(keyData.expireDate);
  return now <= expireDate;
}

// Pollinations.ai Integration
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

// Main Vercel Handler
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  console.log(`Request: ${req.method} ${path}`);

  // GET / or /api - API Information
  if (path === "/" || path === "/api") {
    return res.status(200).json({
      name: "TNEH Image Generator API",
      version: "1.0.0",
      status: "Active",
      endpoints: {
        "POST /api/create-key": "Create API key",
        "GET /api/gen": "Generate image (JSON)",
        "GET /api/gen/image": "Generate image (Direct PNG)",
        "GET /api/keys": "List all keys"
      }
    });
  }

  // POST /api/create-key
  if (path === "/api/create-key" && req.method === "POST") {
    let body = {};
    try {
      let data = '';
      for await (const chunk of req) {
        data += chunk;
      }
      body = JSON.parse(data || "{}");
    } catch (e) {}

    const { expireDate } = body;

    if (!expireDate) {
      return res.status(400).json({ 
        error: "expireDate is required",
        example: { expireDate: "2026-12-31" }
      });
    }

    if (!isValidDate(expireDate)) {
      return res.status(400).json({ 
        error: "Invalid expireDate. Use YYYY-MM-DD format" 
      });
    }

    const apiKey = generateApiKey();
    apiKeys.set(apiKey, {
      promptCount: 0,
      expireDate: expireDate,
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      apiKey: apiKey,
      expireDate: expireDate,
      message: "API Key created successfully",
      testUrl: `https://tnehimagegenbd.vercel.app/api/gen/image?apikey=${apiKey}&prompt=cat`
    });
  }

  // GET /api/gen (JSON Response)
  if (path === "/api/gen" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).json({ 
        error: "apikey and prompt are required" 
      });
    }

    if (!isKeyValid(apikey)) {
      return res.status(401).json({ 
        error: "Invalid or expired API key" 
      });
    }

    try {
      const keyData = apiKeys.get(apikey);
      keyData.promptCount++;
      apiKeys.set(apikey, keyData);

      const result = await generateImageFromPollinations(prompt);

      return res.status(200).json({
        success: true,
        prompt: prompt,
        imageBase64: result.imageBase64,
        usageCount: keyData.promptCount,
        expireDate: keyData.expireDate
      });
    } catch (error) {
      return res.status(500).json({ 
        error: "Generation failed", 
        message: error.message 
      });
    }
  }

  // GET /api/gen/image (Direct PNG)
  if (path === "/api/gen/image" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).send("Missing apikey or prompt");
    }

    if (!isKeyValid(apikey)) {
      return res.status(401).send("Invalid or expired API key");
    }

    try {
      const keyData = apiKeys.get(apikey);
      keyData.promptCount++;
      apiKeys.set(apikey, keyData);

      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
      const response = await fetch(imageUrl);
      const imageBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", "image/png");
      return res.status(200).send(Buffer.from(imageBuffer));
    } catch (error) {
      return res.status(500).send("Generation failed");
    }
  }

  // GET /api/keys
  if (path === "/api/keys" && req.method === "GET") {
    const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
      key: key.substring(0, 15) + "...",
      expireDate: data.expireDate,
      promptCount: data.promptCount
    }));
    return res.status(200).json({ total: keys.length, keys: keys });
  }

  // 404
  return res.status(404).json({ 
    error: "Endpoint not found",
    available: ["/api", "/api/create-key", "/api/gen", "/api/gen/image", "/api/keys"]
  });
};
