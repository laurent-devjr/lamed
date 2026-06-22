const MODEL_SONNET = 'claude-sonnet-4-6';
const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mot, texte, type } = req.body;

  if (type === 'traduction_complete') {
    try {
      const res1 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL_SONNET,
          max_tokens: 8000,
          messages: [{ role: 'user', content: `Tu es un traducteur expert en hébreu moderne israélien et en français littéraire. Traduis le texte hébreu ci-dessous en français de qualité littéraire (fidèle au sens, français parfait, style naturel et fluide), puis retourne IMMÉDIATEMENT les segments alignés mot-à-mot entre ta traduction et le texte hébreu.

Puisque tu produis toi-même la traduction, tu connais exactement les correspondances — exploite cela pour un alignement précis.

Règles d'alignement :
- Chaque segment = 1 mot si possible (hébreu et français).
- Exception uniquement si indissociable : nom propre (Tel Aviv), expression figée, ou mot hébreu nécessitant plusieurs mots français (ou vice-versa).
- Préserve EXACTEMENT tous les sauts de ligne du texte hébreu original : chaque saut de ligne devient {"he":"\\n","fr":"\\n"}.

Retourne UNIQUEMENT ce JSON sans commentaire ni backtick :
{"segments":[{"he":"...","fr":"..."},...]}

Texte hébreu :
` + texte }]
        })
      });
      const data1 = await res1.json();
      console.log(JSON.stringify(data1));
      const rawText = data1.content[0].text;
      const jsonStart = rawText.indexOf('{');
      const jsonEnd = rawText.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        console.error('Pas de JSON trouvé dans:', rawText.substring(0, 300));
        return res.status(500).json({ error: 'Pas de JSON dans la réponse' });
      }
      const cleanedText = rawText.slice(jsonStart, jsonEnd + 1);
      let parsed;
      try {
        parsed = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.error('JSON invalide:', parseErr.message, '| Texte:', cleanedText.substring(0, 300));
        return res.status(500).json({ error: 'JSON invalide: ' + parseErr.message });
      }
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
        model: MODEL_HAIKU,
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
