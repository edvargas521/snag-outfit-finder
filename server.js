require('dotenv').config();

const path = require('path');
const express = require('express');
const { analyzeOutfit } = require('./lib/analyzeOutfit');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/analyze', async (req, res) => {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your-api-key-here') {
    console.error('ANTHROPIC_API_KEY is not set in .env');
    return res.status(500).json({ error: 'server_not_configured' });
  }

  try {
    const items = await analyzeOutfit(req.body && req.body.image, {
      apiKey: ANTHROPIC_API_KEY,
      model: ANTHROPIC_MODEL,
    });
    return res.json({ items });
  } catch (err) {
    if (err.code === 'invalid_image') {
      return res.status(400).json({ error: 'invalid_image' });
    }
    console.error('Analyze error:', err);
    return res.status(502).json({ error: 'vision_request_failed' });
  }
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'image_too_large' });
  }
  console.error(err);
  return res.status(500).json({ error: 'server_error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SNAG server running at http://localhost:${PORT}`);
});
