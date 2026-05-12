export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mot, texte, type } = req.body;

  if (type === 'traduction_complete') {
    const prompt = `Tu es un traducteur expert en hébreu moderne israélien. Ton travail se fait en deux étapes :

ÉTAPE 1 : Produis une traduction complète, fidèle, fluide et de haute qualité littéraire du texte hébreu en français. La traduction doit être naturelle, agréable à lire, avec un bon niveau de langue.

ÉTAPE 2 : À partir de ta traduction, crée des segments alignés avec le texte hébreu original. Chaque segment doit être le plus petit possible (idéalement un mot, ou un petit groupe indissociable). Les segments français doivent être des extraits exacts de ta traduction de l'étape 1.

Retourne UNIQUEMENT ce JSON valide, sans commentaire ni backtick :
{"segments":[{"he":"mot hébreu","fr":"traduction correspondante"},...]}

Les sauts de ligne sont représentés par {"he":"\\n","fr":"\\n"}.

Texte hébreu : ${texte}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      const texteReponse = data.content[0].text.replace(/```json|```/g, '').trim();
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