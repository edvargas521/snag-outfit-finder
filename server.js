require('dotenv').config();

const path = require('path');
const express = require('express');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const DETECTION_PROMPT = `You are an expert fashion and costume analyst. Identify every distinct clothing item and accessory worn by the person or character in this image (tops, bottoms, dresses, outerwear, shoes, bags, headwear, jewelry, and other accessories).

Respond with ONLY a JSON array — no markdown, no prose, no code fences, no explanation. Each element must be an object with exactly these keys:
- "category": a short lowercase label, e.g. "top", "bottom", "dress", "outerwear", "shoes", "bag", "headwear", "jewelry", "accessory"
- "description": a concise visual description, 5-10 words
- "color": the item's primary color(s)
- "search_query": a short phrase someone could paste into an online store's search bar to find something similar

Do not include body parts, skin, hair, tattoos, or background objects. If nothing is detected, return [].`;

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function buildImageSource(image) {
  if (typeof image !== 'string' || !image) return null;

  const dataUrlMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { type: 'base64', media_type: dataUrlMatch[1], data: dataUrlMatch[2] };
  }

  if (/^https?:\/\//i.test(image)) {
    return { type: 'url', url: image };
  }

  return null;
}

function parseItems(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Model response was not a JSON array');

  return parsed
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      category: String(item.category ?? '').trim(),
      description: String(item.description ?? '').trim(),
      color: String(item.color ?? '').trim(),
      search_query: String(item.search_query ?? '').trim(),
    }))
    .filter((item) => item.description);
}

app.post('/api/analyze', async (req, res) => {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your-api-key-here') {
    console.error('ANTHROPIC_API_KEY is not set in .env');
    return res.status(500).json({ error: 'server_not_configured' });
  }

  const source = buildImageSource(req.body && req.body.image);
  if (!source) {
    return res.status(400).json({ error: 'invalid_image' });
  }

  try {
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source },
              { type: 'text', text: DETECTION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errBody);
      return res.status(502).json({ error: 'vision_request_failed' });
    }

    const data = await anthropicRes.json();
    const text = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const items = parseItems(text);
    return res.json({ items });
  } catch (err) {
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
