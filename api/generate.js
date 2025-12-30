// Vercel Serverless Function for OpenRouter API
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { model, messages } = req.body;

    if (!model || !messages) {
      return res.status(400).json({ error: 'Missing model or messages' });
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.referer || 'https://plotcraft.vercel.app',
        'X-Title': 'PlotCraft'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error: `OpenRouter API error: ${error}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
