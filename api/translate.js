export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mot, texte, type } = req.body;

  if (type === 'traduction_complete') {
    try {
      // Appel 1 : Sonnet produit une traduction libre, fluide, sans contrainte de format
      const promptTraduction = `Tu es un traducteur expert en hébreu moderne israélien. Traduis le texte hébreu suivant en français. La traduction doit être complète, fidèle, fluide et de haute qualité littéraire — naturelle, agréable à lire, avec un bon niveau de langue. Retourne uniquement la traduction française, sans commentaire ni explication.

Texte hébreu :
${texte}`;

      const res1 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{ role: 'user', content: promptTraduction }]
        })
      });
      const data1 = await res1.json();
      const traductionFr = data1.content[0].text.trim();

      // Appel 2 : Haiku aligne mécaniquement la traduction avec le texte hébreu mot à mot
      const promptSegments = `Tu reçois un texte hébreu et sa traduction française. Aligne-les segment par segment. Chaque segment hébreu doit être le plus petit possible (idéalement un mot). Le segment français correspondant doit être un extrait exact de la traduction fournie. Les sauts de ligne deviennent {"he":"\\n","fr":"\\n"}.

Retourne UNIQUEMENT ce JSON valide, sans commentaire ni backtick :
{"segments":[{"he":"...","fr":"..."},...]}

Texte hébreu :
${texte}

Traduction française :
${traductionFr}`;

      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          messages: [{ role: 'user', content: promptSegments }]
        })
      });
      const data2 = await res2.json();
      const texteReponse = data2.content[0].text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(texteReponse);
      return res.status(200).json(parsed);

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const prompt = `Tu es un expert en langue hébraïque. L'utilisateur apprend l'hébreu. Il lit ce texte : "${texte}"

Il a cliqué sur le mot : "${mot}"

Avant de répondre, effectue ces deux dérivations en silence :
1. Identifie la racine : retire les préfixes (ה, ו, ב, כ, ל, מ, ש...), suffixes (ים, ות, ה, י, ך...) et patterns de binyan pour isoler les 3 lettres radicales exactes. Si le mot est d'origine étrangère ou ne possède pas de racine sémitique, indique-le.
2. Vocalise le mot : ajoute les niqqoud complets correspondant à la forme exacte du mot dans ce contexte.

Réponds UNIQUEMENT avec ce format JSON, sans aucun texte autour :
{
  "traduction": "traduction du mot dans ce contexte",
  "motAvecNiqqud": "le mot vocalisé avec ses niqqoud complets dans sa forme du texte",
  "badges": ["nature du mot", "temps ou genre si pertinent"],
  "racine": "les 3 lettres radicales (ex : כ-ת-ב) et le sens fondamental de la racine",
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