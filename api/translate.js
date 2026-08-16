const MODEL_SONNET = 'claude-sonnet-4-6';
const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

const LANG_NAMES = {
  he: 'hébreu', en: 'anglais', es: 'espagnol', de: 'allemand',
  it: 'italien', pt: 'portugais', ar: 'arabe', fa: 'persan',
  ru: 'russe', ja: 'japonais', zh: 'chinois', fr: 'français'
};

// He and Ar have a classical 3-letter root (Semitic) morphology
const SEMITIC = new Set(['he', 'ar']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mot, texte, type, langueApprise = 'he', langueNative = 'fr' } = req.body;

  const nomAppris = LANG_NAMES[langueApprise] || langueApprise;
  const nomNatif  = LANG_NAMES[langueNative]  || langueNative;
  const isSemitic = SEMITIC.has(langueApprise);

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
          messages: [{ role: 'user', content: `Tu es un traducteur expert en ${nomAppris} et en ${nomNatif}. Traduis le texte en ${nomAppris} ci-dessous en ${nomNatif} de qualité littéraire (fidèle au sens, style naturel et fluide), puis retourne IMMÉDIATEMENT les segments alignés mot-à-mot entre ta traduction et le texte source.

Puisque tu produis toi-même la traduction, tu connais exactement les correspondances — exploite cela pour un alignement précis.

Règles d'alignement :
- Chaque segment = 1 mot si possible (source et traduction).
- Exception uniquement si indissociable : nom propre, expression figée, ou mot nécessitant plusieurs mots dans l'autre langue.
- Préserve EXACTEMENT tous les sauts de ligne du texte original : chaque saut de ligne devient {"he":"\\n","fr":"\\n"}.

Retourne UNIQUEMENT ce JSON sans commentaire ni backtick :
{"segments":[{"he":"...","fr":"..."},...]}

(Le champ "he" contient le mot en ${nomAppris}, le champ "fr" contient le mot en ${nomNatif}.)

Texte en ${nomAppris} :
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

  // ── Word analysis ─────────────────────────────────────────────────────────
  const prompt = isSemitic
    ? buildPromptSemitic(mot, texte, nomAppris, nomNatif)
    : buildPromptGeneric(mot, texte, nomAppris, nomNatif);

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

function buildPromptSemitic(mot, texte, nomAppris, nomNatif) {
  return `Tu es un expert en langue ${nomAppris}. L'utilisateur apprend le ${nomAppris}. Il lit ce texte : "${texte}"

Il a cliqué sur le mot : "${mot}"

Avant de répondre, effectue ces deux dérivations en silence :
1. Identifie la racine sémitique : retire les préfixes et suffixes pour isoler les lettres radicales (généralement 3). Si le mot est d'origine étrangère ou ne possède pas de racine sémitique, indique-le.
2. Vocalise le mot : ajoute les signes de vocalisation complets correspondant à la forme exacte du mot dans ce contexte.

Réponds UNIQUEMENT avec ce format JSON, sans aucun texte autour :
{
  "traduction": "traduction du mot en ${nomNatif} dans ce contexte",
  "motAvecNiqqud": "le mot vocalisé avec ses signes de vocalisation complets dans sa forme du texte",
  "badges": ["nature du mot", "temps ou genre si pertinent"],
  "racine": "les lettres radicales et le sens fondamental de la racine",
  "analyse": "2-3 lignes : explication linguistique, forme dans le texte vs forme de base, autres sens courants",
  "estVerbe": true ou false selon que le mot est un verbe,
  "infinitif": "si estVerbe est true : l'infinitif du verbe dans la langue apprise, sinon null"
}`;
}

function buildPromptGeneric(mot, texte, nomAppris, nomNatif) {
  return `Tu es un expert en langue ${nomAppris}. L'utilisateur apprend le ${nomAppris}. Il lit ce texte : "${texte}"

Il a cliqué sur le mot : "${mot}"

Réponds UNIQUEMENT avec ce format JSON, sans aucun texte autour :
{
  "traduction": "traduction du mot en ${nomNatif} dans ce contexte",
  "motAvecNiqqud": "transcription phonétique ou prononciation du mot (si pertinent pour cette langue, sinon null)",
  "badges": ["nature du mot", "genre ou temps si pertinent"],
  "racine": "étymologie ou famille de mots : origine du mot, radical, sens premier",
  "analyse": "2-3 lignes : explication linguistique, forme dans le texte vs forme de base (infinitif, singulier...), autres sens courants",
  "estVerbe": true ou false selon que le mot est un verbe,
  "infinitif": "si estVerbe est true : l'infinitif ou la forme de base du verbe en ${nomAppris}, sinon null"
}`;
}
