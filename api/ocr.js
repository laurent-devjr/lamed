const MODEL_SONNET = 'claude-sonnet-4-6';
const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mediaType, langueApprise = 'he' } = req.body;
  if (!image || !mediaType) {
    return res.status(400).json({ error: 'Champs "image" et "mediaType" requis' });
  }

  const LANG_NAMES = {
    he: 'hébreu', en: 'anglais', es: 'espagnol', de: 'allemand',
    it: 'italien', pt: 'portugais', ar: 'arabe', fa: 'persan',
    ru: 'russe', ja: 'japonais', zh: 'chinois', fr: 'français'
  };
  const nomAppris = LANG_NAMES[langueApprise] || langueApprise;

  const prompt = `Ce document contient du texte en ${nomAppris}. Extrais uniquement le texte en ${nomAppris} que tu vois, sans aucune traduction ni commentaire. Retourne uniquement le texte brut, tel quel. Conserve exactement les retours à la ligne du texte original. Chaque ligne du texte dans l'image doit correspondre à une ligne dans ta réponse.`;

  const isPdf = mediaType === 'application/pdf';

  const contentBlock = isPdf
    ? [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: image
          }
        },
        { type: 'text', text: prompt }
      ]
    : [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: image
          }
        },
        { type: 'text', text: prompt }
      ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL_SONNET,
      max_tokens: 2000,
      messages: [{ role: 'user', content: contentBlock }]
    })
  });

  const data = await response.json();
  if (data.error) {
    return res.status(500).json({ error: data.error.message });
  }

  const texte = data.content[0].text.trim();
  return res.status(200).json({ texte });
}
