export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mot, texte, type } = req.body;

  const prompt = type === 'traduction_complete'
    ? `Tu es un expert traducteur d'hébreu. Traduis ce texte hébreu en français. 
La traduction doit être fidèle et précise, mais écrite en bon français naturel et fluide. 
Ne donne que la traduction, sans commentaire ni explication.
Texte hébreu : "${texte}"`
    : `Tu es un expert en langue hébraïque. L'utilisateur apprend l'hébreu. Il lit ce texte : "${texte}"

Il a cliqué sur le mot : "${mot}"

Réponds UNIQUEMENT avec ce format JSON, sans aucun texte autour :
{
  "traduction": "traduction du mot dans ce contexte",
  "badges": ["nature du mot", "temps ou genre si pertinent"],
  "racine": "les 3 lettres de la racine hébraïque et leur sens",
  "analyse": "2-3 lignes : explication linguistique, forme dans le texte vs forme de base, autres sens courants",
  "estVerbe": true ou false selon que le mot est un verbe,
  "infinitif": "si estVerbe est true : l'infinitif du verbe en hébreu (forme לִ...), sinon null"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}