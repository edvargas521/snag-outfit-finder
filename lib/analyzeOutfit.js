const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const DETECTION_PROMPT = `You are an expert fashion and costume analyst. Identify every distinct clothing item and accessory worn by the person or character in this image (tops, bottoms, dresses, outerwear, shoes, bags, headwear, jewelry, and other accessories).

Respond with ONLY a JSON array — no markdown, no prose, no code fences, no explanation. Each element must be an object with exactly these keys:
- "category": a short lowercase label, e.g. "top", "bottom", "dress", "outerwear", "shoes", "bag", "headwear", "jewelry", "accessory"
- "description": a concise visual description, 5-10 words
- "color": the item's primary color(s)
- "search_query": a short phrase someone could paste into an online store's search bar to find something similar

Do not include body parts, skin, hair, tattoos, or background objects. If nothing is detected, return [].`;

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

async function analyzeOutfit(image, { apiKey, model }) {
  const source = buildImageSource(image);
  if (!source) {
    const err = new Error('invalid_image');
    err.code = 'invalid_image';
    throw err;
  }

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
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
    const err = new Error('vision_request_failed');
    err.code = 'vision_request_failed';
    throw err;
  }

  const data = await anthropicRes.json();
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return parseItems(text);
}

module.exports = { analyzeOutfit };
