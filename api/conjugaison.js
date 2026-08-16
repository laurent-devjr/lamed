import { extractJSON } from './_utils.js';

const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

const LANG_NAMES = {
  he: 'hébreu', en: 'anglais', es: 'espagnol', de: 'allemand',
  it: 'italien', pt: 'portugais', ar: 'arabe', fa: 'persan',
  ru: 'russe', ja: 'japonais', zh: 'chinois', fr: 'français'
};

const SEMITIC = new Set(['he', 'ar']);

function buildPromptSemitic(verbe, nomAppris) {
  return `Tu es un expert en grammaire ${nomAppris}. Donne les conjugaisons complètes du verbe en ${nomAppris} dont l'infinitif est "${verbe}".

CONTRAINTE ABSOLUE : réponds UNIQUEMENT avec cet objet JSON — rien avant {, rien après }. Aucun backtick, aucun commentaire, aucune explication.

{
  "infinitif": "${verbe}",
  "present": {
    "ani_m": "forme je masculin",
    "ani_f": "forme je féminin",
    "ata": "forme tu masculin",
    "at": "forme tu féminin",
    "hou": "forme il",
    "hi": "forme elle",
    "anahnou_m": "forme nous masculin",
    "anahnou_f": "forme nous féminin",
    "atem": "forme vous masculin",
    "aten": "forme vous féminin",
    "hem": "forme ils",
    "hen": "forme elles"
  },
  "passe": {
    "ani_m": "", "ani_f": "", "ata": "", "at": "", "hou": "", "hi": "",
    "anahnou_m": "", "anahnou_f": "", "atem": "", "aten": "", "hem": "", "hen": ""
  },
  "futur": {
    "ani_m": "", "ani_f": "", "ata": "", "at": "", "hou": "", "hi": "",
    "anahnou_m": "", "anahnou_f": "", "atem": "", "aten": "", "hem": "", "hen": ""
  }
}`;
}

function buildPromptGeneric(verbe, nomAppris) {
  return `Tu es un expert en grammaire ${nomAppris}. Conjugue le verbe "${verbe}" en ${nomAppris}.

CONTRAINTE ABSOLUE : réponds UNIQUEMENT avec cet objet JSON — rien avant {, rien après }. Aucun backtick, aucun commentaire, aucune explication.

Remplis chaque champ avec la forme conjuguée exacte (avec le pronom si la langue l'exige).
Si la langue ne distingue pas le genre grammatical, mets la même forme dans les champs m et f.
Si un temps ou une personne n'existe pas dans cette langue, laisse le champ vide ("").

Correspondance des clés :
- ani_m / ani_f         → je (m / f)
- ata / at              → tu (m / f)
- hou / hi              → il / elle
- anahnou_m / anahnou_f → nous (m / f)
- atem / aten           → vous pluriel (m / f)
- hem / hen             → ils / elles

{
  "infinitif": "${verbe}",
  "present":  {"ani_m":"","ani_f":"","ata":"","at":"","hou":"","hi":"","anahnou_m":"","anahnou_f":"","atem":"","aten":"","hem":"","hen":""},
  "passe":    {"ani_m":"","ani_f":"","ata":"","at":"","hou":"","hi":"","anahnou_m":"","anahnou_f":"","atem":"","aten":"","hem":"","hen":""},
  "futur":    {"ani_m":"","ani_f":"","ata":"","at":"","hou":"","hi":"","anahnou_m":"","anahnou_f":"","atem":"","aten":"","hem":"","hen":""}
}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { verbe, langueApprise = 'he' } = req.body;
  if (!verbe) {
    return res.status(400).json({ error: 'Champ "verbe" requis' });
  }

  const nomAppris = LANG_NAMES[langueApprise] || langueApprise;
  const prompt = SEMITIC.has(langueApprise)
    ? buildPromptSemitic(verbe, nomAppris)
    : buildPromptGeneric(verbe, nomAppris);

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
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const rawText = data.content[0].text;
    const extracted = extractJSON(rawText);
    if (!extracted) {
      console.error('[conjugaison] Pas de JSON trouvé. Réponse brute complète :\n', rawText);
      return res.status(500).json({
        error: 'Pas de JSON dans la réponse. Brut : ' + rawText.substring(0, 500)
      });
    }
    let json;
    try {
      json = JSON.parse(extracted);
    } catch (parseErr) {
      console.error('[conjugaison] JSON invalide:', parseErr.message, '\nTexte extrait complet :\n', extracted);
      return res.status(500).json({ error: 'JSON invalide: ' + parseErr.message });
    }
    return res.status(200).json(json);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
