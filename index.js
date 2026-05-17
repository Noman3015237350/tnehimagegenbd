// TNEH Image Generator API - Render.com Ready
// Single file solution - No dependencies

const http = require('http');

// In-memory storage
const apiKeys = new Map();

function generateApiKey() {
    return 'tneh_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
}

async function generateImage(prompt) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
}

const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    
    console.log(`${req.method} ${path}`);
    
    // API Info
    if (path === '/' || path === '/api') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: 'TNEH Image Generator',
            status: 'Running',
            endpoints: {
                'POST /api/create-key?expired=30': 'Create API key',
                'GET /api/keys': 'List all keys',
                'GET /api/gen/image?apikey=KEY&prompt=TEXT': 'Generate PNG image',
                'DELETE /api/revoke-key?apikey=KEY': 'Delete API key'
            }
        }));
        return;
    }
    
    // Create key
    if (path === '/api/create-key' && req.method === 'POST') {
        const days = url.searchParams.get('expired') || 30;
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + parseInt(days));
        
        const apiKey = generateApiKey();
        apiKeys.set(apiKey, {
            createdAt: new Date().toISOString(),
            expireDate: expireDate.toISOString(),
            usage: 0
        });
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            apiKey: apiKey,
            expireDate: expireDate.toISOString().split('T')[0],
            message: 'Save this key!'
        }));
        return;
    }
    
    // List keys
    if (path === '/api/keys' && req.method === 'GET') {
        const keys = Array.from(apiKeys.entries()).map(([key, data]) => ({
            key: key.substring(0, 20) + '...',
            expireDate: data.expireDate.split('T')[0],
            usage: data.usage,
            isValid: new Date(data.expireDate) > new Date()
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: apiKeys.size, keys }));
        return;
    }
    
    // Generate image (PNG)
    if (path === '/api/gen/image' && req.method === 'GET') {
        const apiKey = url.searchParams.get('apikey');
        const prompt = url.searchParams.get('prompt');
        
        if (!apiKey || !prompt) {
            res.writeHead(400);
            res.end('Missing apikey or prompt');
            return;
        }
        
        const keyData = apiKeys.get(apiKey);
        if (!keyData) {
            res.writeHead(401);
            res.end('Invalid API key');
            return;
        }
        
        if (new Date() > new Date(keyData.expireDate)) {
            res.writeHead(401);
            res.end('API key expired');
            return;
        }
        
        keyData.usage++;
        apiKeys.set(apiKey, keyData);
        
        try {
            const imageBuffer = await generateImage(prompt);
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(imageBuffer);
        } catch (error) {
            res.writeHead(500);
            res.end('Image generation failed');
        }
        return;
    }
    
    // Delete key
    if (path === '/api/revoke-key' && (req.method === 'DELETE' || req.method === 'GET')) {
        const apiKey = url.searchParams.get('apikey');
        
        if (!apiKey || !apiKeys.has(apiKey)) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Key not found' }));
            return;
        }
        
        apiKeys.delete(apiKey);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Key revoked' }));
        return;
    }
    
    // 404
    res.writeHead(404);
    res.end('Endpoint not found');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
