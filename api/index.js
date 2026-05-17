// TNEH Image Generator API with Pollinations.ai
// Memory Storage Version (No Database Required)

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

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  console.log(`${req.method} ${pathname} - Request received`);

  // GET / or /api - API Information
  if (pathname === "/" || pathname === "/api") {
    return res.status(200).json({
      name: "TNEH Image Generator API",
      version: "1.0.0",
      status: "Active",
      baseUrl: "https://tnehimagegenbd.onrender.com",
      keysInMemory: apiKeys.size,
      storage: "In-Memory (Temporary)",
      endpoints: {
        "POST /api/create-key": "Create API key - ব্যবহার: ?expired=30",
        "GET /api/keys": "সব API key লিস্ট দেখুন",
        "GET /api/gen": "ইমেজ জেনারেট (JSON) - ?apikey=KEY&prompt=TEXT",
        "GET /api/gen/image": "ইমেজ জেনারেট (Direct PNG) - ?apikey=KEY&prompt=TEXT",
        "DELETE /api/revoke-key": "API key ডিলিট করুন - ?apikey=KEY"
      },
      examples: {
        create_key: `curl -X POST "https://tnehimagegenbd.onrender.com/api/create-key?expired=30"`,
        list_keys: `curl https://tnehimagegenbd.onrender.com/api/keys`,
        generate_image: `curl "https://tnehimagegenbd.onrender.com/api/gen/image?apikey=YOUR_KEY&prompt=cat" --output cat.png`,
        delete_key: `curl -X DELETE "https://tnehimagegenbd.onrender.com/api/revoke-key?apikey=YOUR_KEY"`
      }
    });
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
      try {
        let data = '';
        for await (const chunk of req) {
          data += chunk;
        }
        const body = JSON.parse(data || "{}");
        expireDate = body.expireDate || body.expired;
        if (expireDate && !isNaN(parseInt(expireDate))) {
          const date = new Date();
          date.setDate(date.getDate() + parseInt(expireDate));
          expireDate = date.toISOString().split('T')[0];
        }
      } catch (e) {}
    }
    
    if (!expireDate) {
      return res.status(400).json({ 
        error: "expireDate or expired parameter required",
        example: "curl -X POST 'https://tnehimagegenbd.onrender.com/api/create-key?expired=30'"
      });
    }
    
    if (!isValidDate(expireDate)) {
      return res.status(400).json({ error: "Invalid expireDate" });
    }

    const apiKey = generateApiKey();
    apiKeys.set(apiKey, {
      promptCount: 0,
      expireDate: expireDate,
      createdAt: new Date().toISOString(),
      lastUsed: null
    });

    return res.status(201).json({
      success: true,
      apiKey: apiKey,
      expireDate: expireDate,
      message: "API Key created successfully",
      totalKeys: apiKeys.size,
      note: "⚠️ Save this key! Keys are stored in memory only."
    });
  }

  // GET /api/keys
  if (pathname === "/api/keys" && req.method === "GET") {
    const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
      key: key,
      keyMasked: key.substring(0, 20) + "...",
      expireDate: data.expireDate,
      promptCount: data.promptCount,
      createdAt: data.createdAt,
      lastUsed: data.lastUsed,
      isValid: new Date(data.expireDate) > new Date()
    }));
    
    return res.status(200).json({ 
      success: true,
      totalKeys: apiKeys.size,
      keys: keys,
      serverTime: new Date().toISOString()
    });
  }

  // DELETE /api/revoke-key
  if (pathname === "/api/revoke-key" && (req.method === "DELETE" || req.method === "GET")) {
    const apikey = url.searchParams.get("apikey");
    
    if (!apikey) {
      return res.status(400).json({ error: "apikey required" });
    }
    
    if (!apiKeys.has(apikey)) {
      return res.status(404).json({ error: "API key not found" });
    }
    
    const keyData = apiKeys.get(apikey);
    apiKeys.delete(apikey);
    
    return res.status(200).json({
      success: true,
      message: "API key revoked successfully",
      deletedKey: apikey.substring(0, 20) + "...",
      expireDate: keyData.expireDate,
      remainingKeys: apiKeys.size
    });
  }

  // GET /api/gen (JSON Response)
  if (pathname === "/api/gen" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).json({ error: "apikey and prompt are required" });
    }

    if (!apiKeys.has(apikey)) {
      return res.status(401).json({ error: "API key not found" });
    }

    const keyData = apiKeys.get(apikey);
    if (new Date() > new Date(keyData.expireDate)) {
      return res.status(401).json({ error: "API key expired on " + keyData.expireDate });
    }

    try {
      keyData.promptCount++;
      keyData.lastUsed = new Date().toISOString();
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
      return res.status(500).json({ error: "Image generation failed: " + error.message });
    }
  }

  // GET /api/gen/image (Direct PNG)
  if (pathname === "/api/gen/image" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).send("Missing apikey or prompt");
    }

    if (!apiKeys.has(apikey)) {
      return res.status(401).send("API key not found");
    }

    const keyData = apiKeys.get(apikey);
    if (new Date() > new Date(keyData.expireDate)) {
      return res.status(401).send("API key expired");
    }

    try {
      keyData.promptCount++;
      keyData.lastUsed = new Date().toISOString();
      apiKeys.set(apikey, keyData);

      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
      const response = await fetch(imageUrl);
      const imageBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", "image/png");
      return res.status(200).send(Buffer.from(imageBuffer));
    } catch (error) {
      return res.status(500).send("Image generation failed");
    }
  }

  // 404
  return res.status(404).json({ 
    error: "Endpoint not found",
    availableEndpoints: ["/", "/api", "/api/create-key", "/api/keys", "/api/gen", "/api/gen/image", "/api/revoke-key"]
  });
};
