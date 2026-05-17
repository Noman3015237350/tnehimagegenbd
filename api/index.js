// TNEH Image Generator API with Pollinations.ai
// এখন ?expired=30 দিয়েও API Key তৈরি করা যাবে

let apiKeys = new Map();

// Helper Functions
function generateApiKey() {
  return "tneh_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10);
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date > new Date();
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

  // GET / or /api - API Information
  if (path === "/" || path === "/api") {
    return res.status(200).json({
      name: "TNEH Image Generator API",
      version: "1.0.0",
      status: "Active",
      keysInMemory: apiKeys.size,
      endpoints: {
        "POST /api/create-key": "Create API key (JSON body or URL params)",
        "GET /api/keys": "List all keys",
        "GET /api/gen": "Generate image (JSON)",
        "GET /api/gen/image": "Generate image (Direct PNG)"
      },
      examples: {
        create_key_via_json: `curl -X POST https://tnehimagegenbd.vercel.app/api/create-key -H "Content-Type: application/json" -d '{"expireDate": "2026-12-31"}'`,
        create_key_via_params: `curl -X POST "https://tnehimagegenbd.vercel.app/api/create-key?expired=30"`,
        list_keys: `curl https://tnehimagegenbd.vercel.app/api/keys`,
        generate_image: `curl "https://tnehimagegenbd.vercel.app/api/gen/image?apikey=YOUR_KEY&prompt=cat" --output cat.png`
      }
    });
  }

  // POST /api/create-key (সাপোর্ট করে: JSON বডি এবং URL প্যারামিটার)
  if (path === "/api/create-key" && req.method === "POST") {
    let expireDate = null;
    
    // প্রথমে URL প্যারামিটার চেক করুন (যেমন: ?expired=30)
    const expiredDays = url.searchParams.get("expired");
    if (expiredDays && !isNaN(parseInt(expiredDays))) {
      const days = parseInt(expiredDays);
      const date = new Date();
      date.setDate(date.getDate() + days);
      expireDate = date.toISOString().split('T')[0];
    }
    
    // URL প্যারামিটার না থাকলে, JSON বডি চেক করুন
    if (!expireDate) {
      try {
        let data = '';
        for await (const chunk of req) {
          data += chunk;
        }
        const body = JSON.parse(data || "{}");
        expireDate = body.expireDate || body.expired;
        
        // যদি expired নামে সংখ্যা আসে (যেমন: {"expired": 30})
        if (expireDate && !isNaN(parseInt(expireDate)) && typeof expireDate === 'number') {
          const date = new Date();
          date.setDate(date.getDate() + parseInt(expireDate));
          expireDate = date.toISOString().split('T')[0];
        }
      } catch (e) {}
    }
    
    // কোন পদ্ধতিতেই expireDate না পেলে error দিন
    if (!expireDate) {
      return res.status(400).json({ 
        error: "expireDate or expired parameter required",
        example_via_url: "curl -X POST 'https://tnehimagegenbd.vercel.app/api/create-key?expired=30'",
        example_via_json: "curl -X POST https://tnehimagegenbd.vercel.app/api/create-key -H 'Content-Type: application/json' -d '{\"expireDate\": \"2026-12-31\"}'"
      });
    }
    
    // যদি expireDate ভ্যালিড তারিখ না হয়
    if (!isValidDate(expireDate)) {
      return res.status(400).json({ 
        error: "Invalid expireDate. Use YYYY-MM-DD format or expired=DAYS" 
      });
    }

    const apiKey = generateApiKey();
    const keyData = {
      promptCount: 0,
      expireDate: expireDate,
      createdAt: new Date().toISOString(),
      lastUsed: null
    };
    
    apiKeys.set(apiKey, keyData);

    return res.status(201).json({
      success: true,
      apiKey: apiKey,
      expireDate: expireDate,
      createdAt: keyData.createdAt,
      message: "API Key created successfully",
      totalKeys: apiKeys.size,
      testUrl: `https://tnehimagegenbd.vercel.app/api/gen/image?apikey=${apiKey}&prompt=cat`
    });
  }

  // GET /api/keys - List all keys
  if (path === "/api/keys" && req.method === "GET") {
    const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
      key: key,
      keyMasked: key.substring(0, 20) + "...",
      expireDate: data.expireDate,
      promptCount: data.promptCount,
      createdAt: data.createdAt,
      lastUsed: data.lastUsed || "Never",
      isValid: new Date(data.expireDate) > new Date()
    }));
    
    return res.status(200).json({ 
      success: true,
      totalKeys: apiKeys.size,
      keys: keys,
      serverTime: new Date().toISOString()
    });
  }

  // GET /api/gen (JSON Response)
  if (path === "/api/gen" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).json({ 
        error: "apikey and prompt are required",
        example: "/api/gen?apikey=YOUR_KEY&prompt=beautiful+sunset"
      });
    }

    if (!apiKeys.has(apikey)) {
      return res.status(401).json({ 
        error: "API key not found. Create a key using POST /api/create-key?expired=30"
      });
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
      return res.status(500).json({ error: "Image generation failed", message: error.message });
    }
  }

  // GET /api/gen/image (Direct PNG)
  if (path === "/api/gen/image" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).send("Missing apikey or prompt. Usage: /api/gen/image?apikey=KEY&prompt=TEXT");
    }

    if (!apiKeys.has(apikey)) {
      return res.status(401).send("API key not found. Create a key using POST /api/create-key?expired=30");
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
    availableEndpoints: ["/api", "/api/create-key", "/api/keys", "/api/gen", "/api/gen/image"],
    note: "For create-key, use: POST /api/create-key?expired=30 or POST with JSON body"
  });
};
