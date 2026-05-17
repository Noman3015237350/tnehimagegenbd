// TNEH Image Generator API with Pollinations.ai
// Live at: https://tnehimagegenbd.vercel.app

const crypto = require("crypto");

// In-memory storage (replace with DB in production)
let apiKeys = new Map();

// ---------- Helper Functions ----------
function generateApiKey() {
  return "tneh_" + crypto.randomBytes(32).toString("hex");
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

// ---------- Pollinations.ai Integration ----------
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

// ---------- Main Vercel Handler ----------
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-API-Key"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // ---------- GET / or /api ----------
  if (path === "/" || path === "/api") {
    return res.status(200).json({
      name: "TNEH Image Generator API",
      version: "1.0.0",
      description: "AI Image Generation API powered by Pollinations.ai",
      mainAPI: "https://image.pollinations.ai/prompt/",
      baseURL: "https://tnehimagegenbd.vercel.app",
      endpoints: {
        "GET /": "API Information",
        "POST /api/create-key": "Create API key (expireDate required)",
        "GET /api/gen": "Generate image → JSON response",
        "GET /api/gen/image": "Generate image → direct PNG",
        "GET /api/keys": "List all keys (admin)",
        "DELETE /api/revoke-key": "Revoke an API key",
      },
      example: {
        createKey:
          'POST /api/create-key -d {"expireDate": "2026-12-31"}',
        generateImage:
          "GET /api/gen?apikey=YOUR_KEY&prompt=cat",
        directImage:
          "GET /api/gen/image?apikey=YOUR_KEY&prompt=dragon",
      },
    });
  }

  // ---------- POST /api/create-key ----------
  if (path === "/api/create-key" && req.method === "POST") {
    let body = {};
    try {
      const buffers = [];
      for await (const chunk of req) buffers.push(chunk);
      const data = Buffer.concat(buffers).toString();
      body = JSON.parse(data || "{}");
    } catch (e) {}

    const { expireDate } = body;

    if (!expireDate) {
      return res.status(400).json({
        error: "expireDate is required",
        format: "YYYY-MM-DD",
        example: { expireDate: "2026-12-31" },
      });
    }

    if (!isValidDate(expireDate)) {
      return res.status(400).json({
        error:
          "Invalid expireDate. Must be future date in YYYY-MM-DD format",
      });
    }

    const apiKey = generateApiKey();
    apiKeys.set(apiKey, {
      promptCount: 0,
      expireDate: expireDate,
      createdAt: new Date().toISOString(),
      lastUsed: null,
    });

    return res.status(201).json({
      success: true,
      apiKey: apiKey,
      expireDate: expireDate,
      createdAt: new Date().toISOString(),
      message: "API Key created successfully",
      endpoint: `https://tnehimagegenbd.vercel.app/api/gen?apikey=${apiKey}&prompt=your_prompt`,
    });
  }

  // ---------- GET /api/gen (JSON) ----------
  if (path === "/api/gen" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).json({
        error: "Missing required parameters",
        required: ["apikey", "prompt"],
        example: "/api/gen?apikey=YOUR_KEY&prompt=beautiful+sunset",
      });
    }

    if (!isKeyValid(apikey)) {
      return res.status(401).json({
        error: "Invalid or expired API key",
        message: "Please create a new API key using /api/create-key",
      });
    }

    try {
      const keyData = apiKeys.get(apikey);
      keyData.promptCount++;
      keyData.lastUsed = new Date().toISOString();
      apiKeys.set(apikey, keyData);

      const result = await generateImageFromPollinations(prompt);

      return res.status(200).json({
        success: true,
        prompt: prompt,
        imageBase64: result.imageBase64,
        imageUrl: result.imageUrl,
        apiKey: apikey.substring(0, 10) + "...",
        usageCount: keyData.promptCount,
        expireDate: keyData.expireDate,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        error: "Image generation failed",
        message: error.message,
      });
    }
  }

  // ---------- GET /api/gen/image (direct PNG) ----------
  if (path === "/api/gen/image" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).send("Missing apikey or prompt parameter");
    }

    if (!isKeyValid(apikey)) {
      return res.status(401).send("Invalid or expired API key");
    }

    try {
      const keyData = apiKeys.get(apikey);
      keyData.promptCount++;
      keyData.lastUsed = new Date().toISOString();
      apiKeys.set(apikey, keyData);

      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
      const response = await fetch(imageUrl);
      const imageBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("X-Generated-By", "TNEH-API");
      res.setHeader("X-Prompt", encodeURIComponent(prompt));

      return res.status(200).send(Buffer.from(imageBuffer));
    } catch (error) {
      return res.status(500).send("Image generation failed: " + error.message);
    }
  }

  // ---------- GET /api/keys (list all keys) ----------
  if (path === "/api/keys" && req.method === "GET") {
    const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
      key: key.substring(0, 15) + "...",
      fullKey: key,
      expireDate: data.expireDate,
      promptCount: data.promptCount,
      createdAt: data.createdAt,
      lastUsed: data.lastUsed || "Never",
      isValid: new Date(data.expireDate) > new Date(),
    }));

    return res.status(200).json({
      total: keys.length,
      keys: keys,
      serverTime: new Date().toISOString(),
    });
  }

  // ---------- DELETE /api/revoke-key ----------
  if (path === "/api/revoke-key" && req.method === "DELETE") {
    let body = {};
    try {
      const buffers = [];
      for await (const chunk of req) buffers.push(chunk);
      const data = Buffer.concat(buffers).toString();
      body = JSON.parse(data || "{}");
    } catch (e) {}

    const { apiKey } = body;

    if (!apiKey || !apiKeys.has(apiKey)) {
      return res.status(404).json({ error: "API key not found" });
    }

    apiKeys.delete(apiKey);
    return res.status(200).json({
      success: true,
      message: "API key revoked successfully",
    });
  }

  // ---------- 404 Fallback ----------
  return res.status(404).json({
    error: "Endpoint not found",
    availableEndpoints: [
      "/",
      "/api",
      "/api/create-key",
      "/api/gen",
      "/api/gen/image",
      "/api/keys",
      "/api/revoke-key",
    ],
  });
};
