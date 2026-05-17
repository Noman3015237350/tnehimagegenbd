// TNEH Image Generator API with Pollinations.ai
// Render.com Compatible Version with SQLite

const Database = require('better-sqlite3');
const path = require('path');

// Initialize SQLite database
const db = new Database(path.join(__dirname, 'api_keys.db'));

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    api_key TEXT PRIMARY KEY,
    prompt_count INTEGER DEFAULT 0,
    expire_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used TEXT
  )
`);

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

// Database operations
function getApiKeyData(apiKey) {
  const stmt = db.prepare('SELECT * FROM api_keys WHERE api_key = ?');
  return stmt.get(apiKey);
}

function getAllKeys() {
  const stmt = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC');
  return stmt.all();
}

function createKey(apiKey, expireDate, createdAt) {
  const stmt = db.prepare('INSERT INTO api_keys (api_key, expire_date, created_at) VALUES (?, ?, ?)');
  return stmt.run(apiKey, expireDate, createdAt);
}

function updateKeyUsage(apiKey, promptCount, lastUsed) {
  const stmt = db.prepare('UPDATE api_keys SET prompt_count = ?, last_used = ? WHERE api_key = ?');
  return stmt.run(promptCount, lastUsed, apiKey);
}

function deleteKey(apiKey) {
  const stmt = db.prepare('DELETE FROM api_keys WHERE api_key = ?');
  return stmt.run(apiKey);
}

function getTotalKeys() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM api_keys');
  return stmt.get().count;
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
  const path = url.pathname;

  // GET / or /api - API Information
  if (path === "/" || path === "/api") {
    return res.status(200).json({
      name: "TNEH Image Generator API",
      version: "1.0.0",
      status: "Active",
      keysInMemory: getTotalKeys(),
      database: "SQLite (Persistent)",
      endpoints: {
        "POST /api/create-key": "Create API key - ব্যবহার: ?expired=30 বা JSON বডি",
        "GET /api/keys": "সব API key লিস্ট দেখুন",
        "GET /api/gen": "ইমেজ জেনারেট (JSON) - ?apikey=KEY&prompt=TEXT",
        "GET /api/gen/image": "ইমেজ জেনারেট (Direct PNG) - ?apikey=KEY&prompt=TEXT",
        "DELETE /api/revoke-key": "API key ডিলিট করুন - ?apikey=KEY&delete=yes"
      },
      examples: {
        create_key: `curl -X POST "https://YOUR-RENDER-URL.onrender.com/api/create-key?expired=30"`,
        list_keys: `curl https://YOUR-RENDER-URL.onrender.com/api/keys`,
        generate_image: `curl "https://YOUR-RENDER-URL.onrender.com/api/gen/image?apikey=YOUR_KEY&prompt=cat" --output cat.png`,
        delete_key: `curl -X DELETE "https://YOUR-RENDER-URL.onrender.com/api/revoke-key?apikey=YOUR_KEY&delete=yes"`
      }
    });
  }

  // POST /api/create-key
  if (path === "/api/create-key" && req.method === "POST") {
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
        if (expireDate && !isNaN(parseInt(expireDate)) && typeof expireDate === 'number') {
          const date = new Date();
          date.setDate(date.getDate() + parseInt(expireDate));
          expireDate = date.toISOString().split('T')[0];
        }
      } catch (e) {}
    }
    
    if (!expireDate) {
      return res.status(400).json({ 
        error: "expireDate or expired parameter required",
        example: "curl -X POST 'https://YOUR-RENDER-URL.onrender.com/api/create-key?expired=30'"
      });
    }
    
    if (!isValidDate(expireDate)) {
      return res.status(400).json({ error: "Invalid expireDate" });
    }

    const apiKey = generateApiKey();
    const createdAt = new Date().toISOString();
    
    createKey(apiKey, expireDate, createdAt);

    return res.status(201).json({
      success: true,
      apiKey: apiKey,
      expireDate: expireDate,
      message: "API Key created successfully",
      totalKeys: getTotalKeys()
    });
  }

  // GET /api/keys
  if (path === "/api/keys" && req.method === "GET") {
    const keys = getAllKeys().map(row => ({
      key: row.api_key,
      keyMasked: row.api_key.substring(0, 20) + "...",
      expireDate: row.expire_date,
      promptCount: row.prompt_count,
      createdAt: row.created_at,
      lastUsed: row.last_used,
      isValid: new Date(row.expire_date) > new Date()
    }));
    
    return res.status(200).json({ 
      success: true,
      totalKeys: getTotalKeys(),
      keys: keys,
      serverTime: new Date().toISOString()
    });
  }

  // DELETE /api/revoke-key
  if (path === "/api/revoke-key" && (req.method === "DELETE" || req.method === "GET")) {
    const apikey = url.searchParams.get("apikey");
    const deleteParam = url.searchParams.get("delete");
    
    let bodyKey = null;
    if (req.method === "DELETE") {
      try {
        let data = '';
        for await (const chunk of req) {
          data += chunk;
        }
        const body = JSON.parse(data || "{}");
        bodyKey = body.apiKey;
      } catch (e) {}
    }
    
    const finalKey = apikey || bodyKey;
    
    if (!finalKey) {
      return res.status(400).json({ 
        error: "apikey required",
        example: "curl -X DELETE 'https://YOUR-RENDER-URL.onrender.com/api/revoke-key?apikey=YOUR_KEY&delete=yes'"
      });
    }
    
    const keyData = getApiKeyData(finalKey);
    if (!keyData) {
      return res.status(404).json({ error: "API key not found" });
    }
    
    deleteKey(finalKey);
    
    return res.status(200).json({
      success: true,
      message: "API key revoked successfully",
      deletedKey: finalKey.substring(0, 20) + "...",
      expireDate: keyData.expire_date,
      remainingKeys: getTotalKeys()
    });
  }

  // GET /api/gen (JSON Response)
  if (path === "/api/gen" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).json({ error: "apikey and prompt are required" });
    }

    const keyData = getApiKeyData(apikey);
    if (!keyData) {
      return res.status(401).json({ error: "API key not found" });
    }

    if (new Date() > new Date(keyData.expire_date)) {
      return res.status(401).json({ error: "API key expired on " + keyData.expire_date });
    }

    try {
      const newPromptCount = keyData.prompt_count + 1;
      const lastUsed = new Date().toISOString();
      updateKeyUsage(apikey, newPromptCount, lastUsed);

      const result = await generateImageFromPollinations(prompt);

      return res.status(200).json({
        success: true,
        prompt: prompt,
        imageBase64: result.imageBase64,
        usageCount: newPromptCount,
        expireDate: keyData.expire_date
      });
    } catch (error) {
      return res.status(500).json({ error: "Image generation failed" });
    }
  }

  // GET /api/gen/image (Direct PNG)
  if (path === "/api/gen/image" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).send("Missing apikey or prompt");
    }

    const keyData = getApiKeyData(apikey);
    if (!keyData) {
      return res.status(401).send("API key not found");
    }

    if (new Date() > new Date(keyData.expire_date)) {
      return res.status(401).send("API key expired");
    }

    try {
      const newPromptCount = keyData.prompt_count + 1;
      const lastUsed = new Date().toISOString();
      updateKeyUsage(apikey, newPromptCount, lastUsed);

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
    available: ["/api", "/api/create-key", "/api/keys", "/api/gen", "/api/gen/image", "/api/revoke-key"]
  });
};
