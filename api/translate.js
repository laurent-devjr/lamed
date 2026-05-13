function redistribuerCorrections(segments, correctedFr) {
  const nonNl = segments
    .map((s, i) => ({ ...s, origIdx: i }))
    .filter(s => s.he !== '\n' && s.fr !== '\n');

  const origTotalWords = nonNl.reduce(
    (acc, s) => acc + s.fr.trim().split(/\s+/).filter(Boolean).length, 0
  );
  const corrWords = correctedFr.trim().split(/\s+/).filter(Boolean);

  let corrPos = 0;
  nonNl.forEach((seg, i) => {
    const segWordCount = seg.fr.trim().split(/\s+/).filter(Boolean).length;
    if (i === nonNl.length - 1) {
      segments[seg.origIdx].fr = corrWords.slice(corrPos).join(' ') || seg.fr;
    } else {
      const ratio = segWordCount / origTotalWords;
      const remaining = nonNl.length - 1 - i;
      let count = Math.max(1, Math.round(ratio * corrWords.length));
      count = Math.min(count, corrWords.length - corrPos - remaining);
      count = Math.max(1, count);
      segments[seg.origIdx].fr = corrWords.slice(corrPos, corrPos + count).join(' ');
      corrPos += count;
    }
  });

  return segments;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mot, texte, type } = req.body;

  if (type === 'traduction_complete') {
    try {
      // Appel 1 : Sonnet traduit et segmente en une seule passe
      const promptTraduction = `Tu es un traducteur expert en hébreu moderne israélien. Travaille en deux étapes :
ÉTAPE 1 : Produis une traduction complète, fidèle et de haute qualité littéraire en français. La traduction doit être naturelle, fluide, avec un excellent niveau de langue, sans aucune faute de grammaire ni de syntaxe.
ÉTAPE 2 : Découpe ta traduction en segments alignés avec l'hébreu original. Chaque segment = un mot ou groupe indissociable. Les segments français doivent être des extraits exacts de ta traduction. La ponctuation est attachée au segment qui la précède.
Retourne UNIQUEMENT ce JSON sans commentaire ni backtick : {"segments":[{"he":"...","fr":"..."},...]}
Sauts de ligne : {"he":"\\n","fr":"\\n"}.
Texte hébreu : ${texte}`;

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
      const texteReponse1 = data1.content[0].text.replace(/```json|```/g, '').trim();
      const segments = JSON.parse(texteReponse1).segments;

      // Reconstitue le texte français complet pour relecture
      const texteFrancaisComplet = segments
        .filter(s => s.he !== '\n' && s.fr !== '\n')
        .map(s => s.fr)
        .join(' ');

      // Appel 2 : Sonnet relit et corrige le français
      const promptRelecture = `Tu es un correcteur littéraire expert en français. Relis cette traduction de l'hébreu et corrige toute faute de grammaire, de syntaxe ou de style maladroit. Retourne UNIQUEMENT le texte corrigé, sans commentaire, sans explication. Si le texte est parfait, retourne-le tel quel. Texte : ${texteFrancaisComplet}`;

      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{ role: 'user', content: promptRelecture }]
        })
      });
      const data2 = await res2.json();
      const texteFrCorrige = data2.content[0].text.trim();

      // Redistribue les corrections dans les segments
      const segmentsCorrigesJSON = redistribuerCorrections(segments, texteFrCorrige);
      return res.status(200).json({ segments: segmentsCorrigesJSON });

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
