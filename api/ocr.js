export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mediaType } = req.body;
  if (!image || !mediaType) {
    return res.status(400).json({ error: 'Champs "image" et "mediaType" requis' });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: image
            }
          },
          {
            type: 'text',
            text: "Ce document contient du texte en hébreu. Extrais uniquement le texte hébreu que tu vois, sans aucune traduction ni commentaire. Retourne uniquement le texte hébreu brut, tel quel. Conserve exactement les retours à la ligne du texte original. Chaque ligne du texte dans l'image doit correspondre à une ligne dans ta réponse."
          }
        ]
      }]
    })
  });

  const data = await response.json();
  if (data.error) {
    return res.status(500).json({ error: data.error.message });
  }

  const texte = data.content[0].text.trim();
  return res.status(200).json({ texte });
}
