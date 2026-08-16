const MODEL_SONNET = 'claude-sonnet-4-6';
const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { verbe, langueApprise = 'he' } = req.body;
  if (!verbe) {
    return res.status(400).json({ error: 'Champ "verbe" requis' });
  }

  const LANG_NAMES = {
    he: 'hébreu', en: 'anglais', es: 'espagnol', de: 'allemand',
    it: 'italien', pt: 'portugais', ar: 'arabe', fa: 'persan',
    ru: 'russe', ja: 'japonais', zh: 'chinois', fr: 'français'
  };
  const nomAppris = LANG_NAMES[langueApprise] || langueApprise;

  const prompt = `Tu es un expert en grammaire ${nomAppris}. Donne les conjugaisons complètes du verbe en ${nomAppris} dont l'infinitif est "${verbe}".

Réponds UNIQUEMENT avec ce format JSON, sans aucun texte autour :
{
  "infinitif": "${verbe}",
  "present": {
    "ani_m": "forme אני masculin",
    "ani_f": "forme אני féminin",
    "ata": "forme אתה",
    "at": "forme את",
    "hou": "forme הוא",
    "hi": "forme היא",
    "anahnou_m": "forme אנחנו masculin",
    "anahnou_f": "forme אנחנו féminin",
    "atem": "forme אתם",
    "aten": "forme אתן",
    "hem": "forme הם",
    "hen": "forme הן"
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

    const texte = data.content[0].text.replace(/```json|```/g, '').trim();
    const json = JSON.parse(texte);
    return res.status(200).json(json);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
