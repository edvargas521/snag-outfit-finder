const { analyzeOutfit } = require('../lib/analyzeOutfit');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set');
    res.status(500).json({ error: 'server_not_configured' });
    return;
  }

  try {
    const items = await analyzeOutfit(req.body && req.body.image, {
      apiKey: ANTHROPIC_API_KEY,
      model: ANTHROPIC_MODEL,
    });
    res.status(200).json({ items });
  } catch (err) {
    if (err.code === 'invalid_image') {
      res.status(400).json({ error: 'invalid_image' });
      return;
    }
    console.error('Analyze error:', err);
    res.status(502).json({ error: 'vision_request_failed' });
  }
};
