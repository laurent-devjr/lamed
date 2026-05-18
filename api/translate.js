export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mot, texte, type } = req.body;

  if (type === 'traduction_complete') {
    try {
      // Appel 1 : Sonnet produit une traduction de haute qualité
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
          messages: [{ role: 'user', content: 'Tu es un traducteur et correcteur expert en hébreu moderne israélien et en français littéraire. Traduis ce texte hébreu en français. Exigences absolues : traduction fidèle au sens original, français parfait sans aucune faute de grammaire ou de syntaxe, style naturel et fluide, excellent niveau de langue. Retourne UNIQUEMENT le texte traduit, sans commentaire ni explication. Texte hébreu : ' + texte }]
        })
      });
      const data1 = await res1.json();
      const texteFrancais = data1.content[0].text.trim();

      // Appel 2 : Sonnet segmente et aligne la traduction avec le texte hébreu
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
          messages: [{ role: 'user', content: 'Tu reçois un texte hébreu original et sa traduction française de qualité. Crée des segments alignés entre les deux textes. Chaque segment = un mot ou groupe indissociable. Les segments français doivent être des extraits exacts de la traduction fournie. IMPORTANT : préserve EXACTEMENT tous les sauts de ligne et paragraphes du texte hébreu original. Chaque saut de ligne simple devient {"he":"\\n","fr":"\\n"}, chaque ligne vide (saut de paragraphe) devient deux objets {"he":"\\n","fr":"\\n"} consécutifs. Retourne UNIQUEMENT ce JSON sans commentaire ni backtick : {"segments":[{"he":"...","fr":"..."},...]}\\nTexte hébreu : ' + texte + '\\nTraduction française : ' + texteFrancais }]
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
