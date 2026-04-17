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

  // Récupérer uniquement les questions candidates (pour la liste)
  if (action === 'lister') {
    const data = await supabase('GET',
      `questions?statut=eq.candidate&order=created_at.desc`
    );
    return res.status(200).json(data);
  }

  // Récupérer toutes les questions tous statuts (pour les stats)
  if (action === 'lister_toutes') {
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

  // Commenter et corriger automatiquement via Claude
  if (action === 'commenter') {
    const { id, commentaire } = req.body;

    // Récupère la question existante
    const existing = await supabase('GET', `questions?id=eq.${id}`);
    const question = existing[0];
    const commentaires = question?.commentaires || [];
    commentaires.push({ type: 'admin', text: commentaire, date: new Date() });

    // Appel Claude pour corriger la question en tenant compte du commentaire
    const correctionRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Tu es un professeur d'hébreu moderne israélien contemporain.

Voici une question de test existante :
${JSON.stringify({
  text: question.text,
  he: question.he,
  options: question.options,
  correct: question.correct,
  feedback: question.feedback
}, null, 2)}

Un administrateur a laissé ce commentaire de correction :
"${commentaire}"

Corrige la question en tenant compte de ce commentaire. Retourne UNIQUEMENT ce JSON sans backticks :
{
  "text": "question corrigée en français",
  "he": "hébreu corrigé (vide si pas nécessaire)",
  "options": ["A", "B", "C", "D"],
  "correct": 0,
  "feedback": "explication pédagogique corrigée"
}`
        }]
      })
    });

    const correctionData = await correctionRes.json();
    const corrected = JSON.parse(
      correctionData.content[0].text.replace(/```json|```/g, '').trim()
    );

    commentaires.push({
      type: 'correction_claude',
      text: 'Question corrigée automatiquement par Claude',
      date: new Date()
    });

    const data = await supabase('PATCH',
      `questions?id=eq.${id}`,
      {
        text: corrected.text,
        he: corrected.he,
        options: corrected.options,
        correct: corrected.correct,
        feedback: corrected.feedback,
        statut: 'candidate',
        commentaires,
        updated_at: new Date()
      }
    );
    return res.status(200).json(data);
  }

  // Générer + vérifier de nouvelles questions
  if (action === 'generer') {
    const { section, nombre, niveau = 2 } = req.body;

    const sectionLabel = {
      vocab: 'vocabulaire (mots du quotidien en hébreu moderne)',
      gram: 'grammaire (hébreu moderne parlé)',
      comp: 'compréhension (textes courts de la vie réelle : SMS, panneaux, menus)'
    }[section];

    const niveauDescriptions = {
      1: 'N1 = mots ultra-courants et expressions de base (שלום, מים, בית, תודה)',
      2: 'N2 = vocabulaire quotidien simple, salutations et besoins essentiels',
      3: 'N3 = phrases courtes, verbes courants au présent et passé simple',
      4: 'N4 = grammaire intermédiaire, binyanim courants (פָּעַל, פִּעֵל, הִפְעִיל), temps multiples',
      5: 'N5 = textes complexes, vocabulaire soutenu, constructions syntaxiques élaborées',
      6: 'N6 = registre littéraire, formes rares, style soutenu et nuances stylistiques'
    };

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

Niveau de difficulté : N${niveau} sur 6 — ${niveauDescriptions[niveau]}
Chaque question générée doit être clairement de ce niveau de difficulté. Ni plus facile, ni plus difficile.

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
  "niveau": ${niveau},
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
        niveau: q.niveau || niveau,
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