export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Tu es un expert en didactique de l'hébreu moderne (israelien contemporain). 
Génère un test de niveau en hébreu MODERNE PARLÉ — pas biblique.

Le test doit contenir exactement 25 questions en JSON, réparties ainsi :
- 10 questions de vocabulaire (mots du quotidien : famille, corps, nourriture, transport, émotions, travail, chiffres, couleurs)
- 10 questions de grammaire (binyanim courants, accords masculin/féminin, temps verbaux, pronoms, prépositions du quotidien)
- 5 questions de compréhension (textes courts de la vie réelle : SMS, panneau, menu, conversation, titre de journal)

Pour chaque question, utilise ce format JSON exact :
{
  "section": "vocab" | "gram" | "comp",
  "badge": "Vocabulaire" | "Grammaire" | "Compréhension",
  "text": "texte de la question en français",
  "he": "mot ou phrase en hébreu (ou vide si pas nécessaire)",
  "options": ["option A", "option B", "option C", "option D"],
  "correct": 0 | 1 | 2 | 3,
  "feedback": "explication courte et pédagogique en français"
}

Règles importantes :
- Uniquement hébreu MODERNE et PARLÉ — aucun verset biblique
- Vocabulaire des 1000 mots les plus fréquents en hébreu contemporain
- Les textes de compréhension doivent être réalistes (SMS, panneaux, menus...)
- Feedback toujours pédagogique et utile
- Difficulté progressive dans chaque section (du plus simple au plus complexe)
- Mélange de questions "hébreu → français" et "français → hébreu"
- Pour les phrases à trou (avec __________) : l'hébreu se lit de droite à gauche, le blanc doit être placé à la position grammaticale exacte du mot manquant dans l'ordre RTL. Exemple incorrect : 'אתמול אני __________' (le blanc est à droite alors que le verbe manquant est en fin de phrase à gauche). Exemple correct : '__________ אתמול אני'. Ne jamais placer le blanc à droite par défaut — toujours respecter la position réelle du mot dans la phrase hébraïque.

Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour, sans backticks.`
        }]
      })
    });

    const data = await response.json();
    let texte = data.content[0].text.trim();
texte = texte.replace(/```json/g, '').replace(/```/g, '').trim();
const questions = JSON.parse(texte);
    res.status(200).json({ questions });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}