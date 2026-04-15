const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
console.log('SUPABASE_URL:', SUPABASE_URL ? 'OK' : 'MANQUANT');
console.log('SUPABASE_KEY:', SUPABASE_KEY ? 'OK' : 'MANQUANT');
console.log('ANTHROPIC_KEY:', process.env.ANTHROPIC_API_KEY ? 'OK' : 'MANQUANT');

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  console.log('Supabase response:', res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export default async function handler(req, res) {
  const { action } = req.body || {};

  // Récupérer les questions candidates
  if (action === 'lister') {
    const data = await supabase('GET',
      `questions?order=created_at.desc`
    );
    return res.status(200).json(data);
  }

  // Valider une question
  if (action === 'valider') {
    const { id } = req.body;
    const data = await supabase('PATCH',
      `questions?id=eq.${id}`,
      { statut: 'validée', updated_at: new Date() }
    );
    return res.status(200).json(data);
  }

  // Rejeter avec commentaire
  if (action === 'commenter') {
    const { id, commentaire } = req.body;

    // Récupère la question existante
    const existing = await supabase('GET', `questions?id=eq.${id}`);
    const commentaires = existing[0]?.commentaires || [];
    commentaires.push({ text: commentaire, date: new Date() });

    const data = await supabase('PATCH',
      `questions?id=eq.${id}`,
      { statut: 'à corriger', commentaires, updated_at: new Date() }
    );
    return res.status(200).json(data);
  }

  // Générer + vérifier de nouvelles questions
  if (action === 'generer') {
    const { section, nombre } = req.body;

    const sectionLabel = {
      vocab: 'vocabulaire (mots du quotidien en hébreu moderne)',
      gram: 'grammaire (hébreu moderne parlé)',
      comp: 'compréhension (textes courts de la vie réelle : SMS, panneaux, menus)'
    }[section];

    // Étape 1 : Génération
    const gen = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `Tu es un professeur d'hébreu moderne israélien contemporain.
Génère ${nombre} questions de ${sectionLabel} pour un test de niveau destiné à des francophones.

Règles strictes :
- Uniquement hébreu MODERNE parlé — aucun verset biblique
- Phrases hébraïques grammaticalement parfaites
- Questions claires et sans ambiguïté pour un francophone
- 4 options de réponse, une seule correcte
- Les distracteurs doivent être plausibles mais clairement incorrects
- Feedback pédagogique utile et précis

Format JSON exact, sans backticks :
[{
  "section": "${section}",
  "badge": "${section === 'vocab' ? 'Vocabulaire' : section === 'gram' ? 'Grammaire' : 'Compréhension'}",
  "text": "question en français",
  "he": "mot ou phrase en hébreu (vide si pas nécessaire)",
  "options": ["A", "B", "C", "D"],
  "correct": 0,
  "feedback": "explication pédagogique"
}]`
        }]
      })
    });

    const genData = await gen.json();
    let questions = JSON.parse(
      genData.content[0].text.replace(/```json|```/g, '').trim()
    );

    // Étape 2 : Vérification par l'équipe pédagogique virtuelle
    const verif = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `Tu es un linguiste expert en hébreu moderne israélien et un pédagogue spécialisé en FLE (français langue étrangère).

Vérifie ces questions de test de langue et retourne un rapport pour chacune.

Questions à vérifier :
${JSON.stringify(questions, null, 2)}

Pour chaque question, vérifie :
1. L'hébreu est-il grammaticalement correct et moderne (pas biblique) ?
2. La question est-elle claire pour un francophone ?
3. Les distracteurs sont-ils pertinents (ni trop évidents ni trop proches) ?
4. Le feedback est-il pédagogiquement utile ?

Réponds UNIQUEMENT avec ce JSON sans backticks :
[{
  "index": 0,
  "valide": true/false,
  "problemes": ["problème 1", "problème 2"],
  "suggestion": "version corrigée si problème détecté"
}]`
        }]
      })
    });

    const verifData = await verif.json();
    const rapports = JSON.parse(
      verifData.content[0].text.replace(/```json|```/g, '').trim()
    );

    // Combine questions + rapports
    const questionsAvecRapport = questions.map((q, i) => ({
      ...q,
      rapport: rapports[i] || { valide: true, problemes: [], suggestion: '' }
    }));

    // Sauvegarde en base avec statut "candidate"
    for (const q of questionsAvecRapport) {
      await supabase('POST', 'questions', {
        section: q.section,
        badge: q.badge,
        text: q.text,
        he: q.he || '',
        options: q.options,
        correct: q.correct,
        feedback: q.feedback,
        statut: 'candidate',
        commentaires: [{
          type: 'rapport_pedagogique',
          valide: q.rapport.valide,
          problemes: q.rapport.problemes,
          suggestion: q.rapport.suggestion,
          date: new Date()
        }]
      });
    }

    return res.status(200).json({ success: true, count: questionsAvecRapport.length });
  }

  return res.status(400).json({ error: 'Action inconnue' });
}