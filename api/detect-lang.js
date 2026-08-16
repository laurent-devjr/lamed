const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { texte } = req.body;
  if (!texte) return res.status(400).json({ error: 'Champ "texte" requis' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `What language is this text written in? Reply with ONLY the ISO 639-1 two-letter code (e.g. en, fr, es, de, it, pt, ru). Nothing else — no explanation, no punctuation.\n\n${texte.slice(0, 300)}`
        }]
      })
    });

    const data = await response.json();
    if (!data.content?.[0]?.text) return res.status(500).json({ error: 'No response' });
    const code = data.content[0].text.trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
    return res.status(200).json({ langue: code || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
