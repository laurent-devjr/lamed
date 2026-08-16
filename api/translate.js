import { extractJSON } from './_utils.js';

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
          messages: [{ role: 'user', content: `Tu es un traducteur expert en ${nomAppris} et en ${nomNatif}.

TÂCHE : traduis le texte ci-dessous en ${nomNatif}, puis retourne un JSON d'alignement token par token.

RÈGLE FONDAMENTALE — ordre des mots : ta traduction doit être naturelle et fluide en ${nomNatif}. L'ordre des mots de la cible est entièrement libre ; ne te laisse jamais contraindre par l'ordre de la langue source.

RÈGLE FONDAMENTALE — identifiant de groupe "g" : chaque token reçoit un entier "g" qui identifie sa correspondance sémantique. Tu attribues "g" AU MOMENT OÙ TU ÉCRIS CHAQUE TOKEN — jamais a posteriori, jamais en comptant les positions. Puisque c'est toi qui traduis, tu sais immédiatement quel mot source correspond à quel mot cible ; tu leur donnes simplement le même "g". Tu n'as jamais à chercher ni à compter.

Format de chaque token : {"t": "texte", "g": entier_ou_null}
- "t" = le mot ou signe de ponctuation (la ponctuation reste attachée au mot qui la précède)
- "g" = entier ≥ 1, partagé entre les tokens correspondants des deux langues ; null si aucune correspondance directe
- Plusieurs tokens peuvent partager le même "g" (relations N→M autorisées)
- Les sauts de ligne sont des tokens {"t": "\\n", "g": null} dans les deux tableaux

CONTRAINTE ABSOLUE : réponds UNIQUEMENT avec l'objet JSON — rien avant {, rien après }. Aucun backtick, aucun commentaire, aucune explication.

{"source":[{"t":"mot","g":1},{"t":"\\n","g":null}],"cible":[{"t":"mot","g":1},{"t":"\\n","g":null}]}

Texte en ${nomAppris} :
` + texte }]
        })
      });
      const data1 = await res1.json();
      const rawText = data1.content[0].text;

      // ── Stop-reason check ────────────────────────────────────────────────
      const stopReason = data1.stop_reason;
      if (stopReason !== 'end_turn') {
        console.error('[align] WARN stop_reason =', stopReason, '(possible truncation)');
      }

      const extracted = extractJSON(rawText);
      if (!extracted) {
        console.error('[align] Pas de JSON trouvé. Réponse brute complète :\n', rawText);
        return res.status(500).json({ error: 'Pas de JSON dans la réponse' });
      }
      let parsed;
      try {
        parsed = JSON.parse(extracted);
      } catch (parseErr) {
        console.error('[align] JSON invalide:', parseErr.message, '\nTexte extrait complet :\n', extracted);
        return res.status(500).json({ error: 'JSON invalide: ' + parseErr.message });
      }
      if (!Array.isArray(parsed.source) || !Array.isArray(parsed.cible)) {
        console.error('[align] Schéma inattendu:', JSON.stringify(parsed).substring(0, 300));
        return res.status(500).json({ error: 'Schéma de réponse invalide' });
      }

      // ── Diagnostic & orphan detection ────────────────────────────────────
      const srcLen = parsed.source.length;
      const cibLen = parsed.cible.length;

      const srcGs = new Set(parsed.source.map(t => t.g).filter(g => g != null));
      const cibGs = new Set(parsed.cible.map(t => t.g).filter(g => g != null));
      const allGs = new Set([...srcGs, ...cibGs]);

      const orphansSrc = [...srcGs].filter(g => !cibGs.has(g));
      const orphansCib = [...cibGs].filter(g => !srcGs.has(g));

      console.log(`[align] source=${srcLen}  cible=${cibLen}  groupes=${allGs.size}  stop=${stopReason}`);
      if (orphansSrc.length > 0 || orphansCib.length > 0) {
        console.error('[align] g orphelins — src sans cible:', orphansSrc, '| cible sans src:', orphansCib);
      } else {
        console.log('[align] Tous les g sont appariés.');
      }

      parsed._debug = {
        srcLen, cibLen, nbGroupes: allGs.size,
        orphelins: { source: orphansSrc, cible: orphansCib },
        stopReason
      };

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
