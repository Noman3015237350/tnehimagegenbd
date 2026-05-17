// TNEH Image Generator API with Pollinations.ai
// PostgreSQL Version for Render.com

const { Pool } = require('pg');

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create table if not exists
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        api_key TEXT PRIMARY KEY,
        prompt_count INTEGER DEFAULT 0,
        expire_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used TEXT
      )
    `);
  } finally {
    client.release();
  }
}

initDatabase();

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

  // GET / or /api - API Information
  if (pathname === "/" || pathname === "/api") {
    const result = await pool.query('SELECT COUNT(*) as count FROM api_keys');
    return res.status(200).json({
      name: "TNEH Image Generator API",
      version: "1.0.0",
      status: "Active",
      baseUrl: "https://tnehimagegenbd.onrender.com",
      keysInDatabase: parseInt(result.rows[0].count),
      database: "PostgreSQL",
      endpoints: {
        "POST /api/create-key": "Create API key - ?expired=30",
        "GET /api/keys": "List all API keys",
        "GET /api/gen": "Generate image (JSON) - ?apikey=KEY&prompt=TEXT",
        "GET /api/gen/image": "Generate image (PNG) - ?apikey=KEY&prompt=TEXT",
        "DELETE /api/revoke-key": "Delete API key - ?apikey=KEY&delete=yes"
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
    const createdAt = new Date().toISOString();
    
    await pool.query(
      'INSERT INTO api_keys (api_key, expire_date, created_at) VALUES ($1, $2, $3)',
      [apiKey, expireDate, createdAt]
    );

    const result = await pool.query('SELECT COUNT(*) as count FROM api_keys');
    
    return res.status(201).json({
      success: true,
      apiKey: apiKey,
      expireDate: expireDate,
      message: "API Key created successfully",
      totalKeys: parseInt(result.rows[0].count)
    });
  }

  // GET /api/keys
  if (pathname === "/api/keys" && req.method === "GET") {
    const result = await pool.query('SELECT * FROM api_keys ORDER BY created_at DESC');
    const keys = result.rows.map(row => ({
      key: row.api_key,
      keyMasked: row.api_key.substring(0, 20) + "...",
      expireDate: row.expire_date,
      promptCount: row.prompt_count,
      createdAt: row.created_at,
      lastUsed: row.last_used,
      isValid: new Date(row.expire_date) > new Date()
    }));
    
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM api_keys');
    
    return res.status(200).json({ 
      success: true,
      totalKeys: parseInt(totalResult.rows[0].count),
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
    
    const result = await pool.query('SELECT * FROM api_keys WHERE api_key = $1', [apikey]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "API key not found" });
    }
    
    await pool.query('DELETE FROM api_keys WHERE api_key = $1', [apikey]);
    const remainingResult = await pool.query('SELECT COUNT(*) as count FROM api_keys');
    
    return res.status(200).json({
      success: true,
      message: "API key revoked successfully",
      deletedKey: apikey.substring(0, 20) + "...",
      expireDate: result.rows[0].expire_date,
      remainingKeys: parseInt(remainingResult.rows[0].count)
    });
  }

  // GET /api/gen (JSON Response)
  if (pathname === "/api/gen" && req.method === "GET") {
    const apikey = url.searchParams.get("apikey");
    const prompt = url.searchParams.get("prompt");

    if (!apikey || !prompt) {
      return res.status(400).json({ error: "apikey and prompt are required" });
    }

    const result = await pool.query('SELECT * FROM api_keys WHERE api_key = $1', [apikey]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "API key not found" });
    }
    
    const keyData = result.rows[0];
    
    if (new Date() > new Date(keyData.expire_date)) {
      return res.status(401).json({ error: "API key expired on " + keyData.expire_date });
    }

    try {
      const newPromptCount = keyData.prompt_count + 1;
      const lastUsed = new Date().toISOString();
      
      await pool.query(
        'UPDATE api_keys SET prompt_count = $1, last_used = $2 WHERE api_key = $3',
        [newPromptCount, lastUsed, apikey]
      );

      const imageResult = await generateImageFromPollinations(prompt);

      return res.status(200).json({
        success: true,
        prompt: prompt,
        imageBase64: imageResult.imageBase64,
        usageCount: newPromptCount,
        expireDate: keyData.expire_date
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

    const result = await pool.query('SELECT * FROM api_keys WHERE api_key = $1', [apikey]);
    
    if (result.rows.length === 0) {
      return res.status(401).send("API key not found");
    }
    
    const keyData = result.rows[0];
    
    if (new Date() > new Date(keyData.expire_date)) {
      return res.status(401).send("API key expired");
    }

    try {
      const newPromptCount = keyData.prompt_count + 1;
      const lastUsed = new Date().toISOString();
      
      await pool.query(
        'UPDATE api_keys SET prompt_count = $1, last_used = $2 WHERE api_key = $3',
        [newPromptCount, lastUsed, apikey]
      );

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

  return res.status(404).json({ error: "Endpoint not found" });
};
