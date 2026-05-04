# Lamed — Documentation du projet

## Vue d'ensemble

**Lamed** (לָמַד, « apprendre » en hébreu) est une application web d'apprentissage de l'hébreu moderne israélien destinée aux francophones. Elle permet de lire des textes hébreux mot par mot avec analyse linguistique à la demande, d'importer un texte depuis une photo via OCR, de consulter les conjugaisons complètes des verbes, de passer un test de niveau adaptatif, et dispose d'un back-office pour gérer une banque de questions pédagogiques avec validation humaine et correction IA.

### Stack technique

| Couche | Technologie |
|---|---|
| Frontend | HTML/CSS/JS vanilla (aucun framework) |
| Backend | Fonctions serverless Vercel (ES modules, `export default handler`) |
| IA | Claude Haiku `claude-haiku-4-5-20251001` — toutes les routes |
| Base de données | Supabase (PostgreSQL) — uniquement pour la banque de questions admin |
| Déploiement | Vercel — routing automatique `api/*.js` → `/api/*` |

---

## Structure des fichiers

```
lamed/
├── index.html            # Interface principale de lecture interactive
├── admin.html            # Back-office de gestion des questions
├── test-niveau.html      # Test de niveau (25 questions générées dynamiquement)
├── CONTEXT.md            # Ce fichier
├── .gitignore            # Exclut .claude/
└── api/
    ├── translate.js      # Analyse de mot + traduction complète de texte
    ├── ocr.js            # Extraction de texte hébreu depuis une image (Claude Vision)
    ├── conjugaison.js    # Conjugaisons complètes d'un verbe hébreu
    ├── generate-test.js  # Génération d'un test de niveau complet (25 questions)
    └── admin-questions.js  # CRUD questions + génération IA + correction IA (Supabase)
```

---

## Pages

### `index.html` — Lecture interactive

Page principale. Flux utilisateur :

1. **Saisie** : l'utilisateur colle du texte hébreu dans la textarea, ou importe une photo
2. **OCR** : si photo, `ocrPhoto()` lit le fichier en base64 via `FileReader` et appelle `/api/ocr` — le texte extrait remplit la textarea
3. **Affichage** : `afficherTexte()` nettoie les niqqoud (U+0591–U+05C7 supprimés), découpe le texte par lignes (`\n`) puis par mots, rend chaque mot en `<span class="word" onclick="traduire(...)">` — les lignes sont séparées par `<br>` pour respecter la mise en page originale
4. **Analyse d'un mot** : clic → `traduire()` → appelle `/api/translate` (type `mot`) → panneau latéral avec traduction, badges, racine, analyse linguistique. Si le mot est un verbe (`json.estVerbe === true`), un bouton "📊 Conjugaisons →" apparaît
5. **Conjugaisons** : clic sur le bouton → `afficherConjugaisons(infinitif)` → appelle `/api/conjugaison` → panneau de conjugaisons s'ouvre par-dessus le panneau latéral
6. **Traduction complète** : bouton "Traduction" → `basculerTraduction()` → appelle `/api/translate` (type `traduction_complete`) → affiche le texte traduit à la place du texte hébreu. Bouton "Original" pour revenir
7. **Nouveau texte** : `nouveauTexte()` réinitialise tout et revient à la saisie

**Panneaux UI :**

- `#sidePanel` (`.side-panel`) : panneau latéral fixe à droite, transition largeur 0 → 320px. Contient : mot hébreu (`#panel-mot`), traduction (`#panel-traduction`), badges (`#panel-badges`), racine + analyse + bouton conjugaisons (`#panel-contenu`)
- `#conjPanel` (`.conj-panel`) : panneau conjugaisons fixe à droite, `z-index: 200`, s'affiche par-dessus le panneau latéral. Contient l'infinitif en grand et 3 tableaux (Présent / הווה · Passé / עבר · Futur / עתיד), chacun avec colonnes **Masc / Fém / Pronom** — pronoms bilingues hébreu/français

**Note OCR** : l'`<input type="file">` n'a pas `capture="environment"` → sur mobile, l'utilisateur choisit entre l'appareil photo et la photothèque (les deux sont disponibles).

---

### `admin.html` — Back-office

Interface de gestion de la banque de questions. Accessible via `/admin.html`.

Fonctionnalités :
- **Génération** : choix de section (Vocabulaire / Grammaire / Compréhension), niveau N1–N6, nombre de questions (3/5/10) → appelle `/api/admin-questions` (action `generer`)
- **Pipeline 2 étapes** : Claude génère les questions, puis un second appel Claude les vérifie pédagogiquement (hébreu correct, clarté, distracteurs, feedback) → chaque question reçoit un rapport `{ valide, problemes, suggestion }`
- **Liste des candidates** : affiche toutes les questions en statut `candidate` avec leur rapport pédagogique
- **Validation** : bouton "✅ Valider" → statut `validée`
- **Correction** : champ texte libre + bouton "✍️ Corriger" → envoie le commentaire à Claude qui régénère la question corrigée → remet en statut `candidate`
- **Stats temps réel** : 4 compteurs (Total / À valider / Validées / À corriger) rechargés à chaque action

---

### `test-niveau.html` — Test de niveau

Test adaptatif de ~10 minutes. Flux en 3 écrans :

1. **Accueil** (`screen-welcome`) : présentation des 3 sections, bouton "Commencer" → appelle `/api/generate-test` → spinner pendant la génération
2. **Questions** (`screen-test`) : barre de progression, 25 questions une par une. Clic sur une option → feedback immédiat (vert/rouge + explication), bouton "Question suivante" ou "Voir mes résultats"
3. **Résultats** (`screen-results`) : score par section (barres de progression), niveau global א–ד avec description narrative, boutons "Refaire" et "Retour à Lamed"

**Évaluation du niveau global** (score = moyenne des 3 sections) :
- < 30 % → **Aleph (א)** — débutant
- 30–54 % → **Bet (ב)** — bases acquises
- 55–74 % → **Gimel (ג)** — intermédiaire
- ≥ 75 % → **Dalet (ד)** — avancé

Le niveau par défaut de génération est N3. Le test appelle `/api/generate-test` sans niveau → défaut N3 côté serveur.

---

## API serverless

### `POST /api/translate`

Deux modes selon `type` :

**Mode `mot`** — analyse d'un mot dans son contexte
```json
// Entrée
{ "mot": "הולך", "texte": "texte hébreu complet", "type": "mot" }

// Sortie (data.content[0].text → JSON parsé)
{
  "traduction": "va, marche",
  "badges": ["verbe", "présent masculin singulier"],
  "racine": "ה-ל-ך — aller, marcher",
  "analyse": "forme קַל au présent...",
  "estVerbe": true,
  "infinitif": "לָלֶכֶת"
}
```

**Mode `traduction_complete`** — traduction libre du texte entier
```json
// Entrée
{ "texte": "texte hébreu complet", "type": "traduction_complete" }

// Sortie : data.content[0].text contient directement le texte traduit en français
```

---

### `POST /api/ocr`

Extraction de texte hébreu depuis une image via Claude Vision (multimodal).

```json
// Entrée
{ "image": "<base64>", "mediaType": "image/jpeg" }

// Sortie
{ "texte": "texte hébreu extrait\navec retours à la ligne préservés" }
```

Le prompt demande à Claude de conserver exactement la mise en page ligne par ligne de l'image originale.

---

### `POST /api/conjugaison`

Conjugaisons complètes d'un verbe hébreu.

```json
// Entrée
{ "verbe": "לָלֶכֶת" }

// Sortie
{
  "infinitif": "לָלֶכֶת",
  "present": {
    "ani_m": "הולך", "ani_f": "הולכת",
    "ata": "הולך", "at": "הולכת",
    "hou": "הולך", "hi": "הולכת",
    "anahnou_m": "הולכים", "anahnou_f": "הולכות",
    "atem": "הולכים", "aten": "הולכות",
    "hem": "הולכים", "hen": "הולכות"
  },
  "passe": { /* même structure 12 clés */ },
  "futur":  { /* même structure 12 clés */ }
}
```

**Affichage dans le panneau conjugaisons :**
- 3 tableaux, un par temps — titres bilingues : `Présent / הווה`, `Passé / עבר`, `Futur / עתיד`
- Colonnes : forme masculine (bleu `#185fa5`) | forme féminine (orange `#b5420a`) | pronom bilingue à droite
- En-têtes : `Masculin / זכר` | `Féminin / נקבה`
- Pronoms affichés avec traduction FR sur deux lignes quand m ≠ f

---

### `POST /api/generate-test`

Génère un test de niveau complet (25 questions) via un seul appel Claude.

```json
// Entrée
{ "niveau": 3 }  // 1–6, défaut 3 si absent

// Sortie
{
  "questions": [ /* 25 objets question */ ],
  "niveau": 3
}
```

Structure d'une question :
```json
{
  "section": "vocab",
  "badge": "Vocabulaire",
  "niveau": 3,
  "text": "Comment dit-on 'eau' en hébreu ?",
  "he": "",
  "options": ["מים", "אש", "אדמה", "רוח"],
  "correct": 0,
  "feedback": "מים (mayim) signifie eau..."
}
```

**Règle RTL importante dans le prompt** : pour les phrases à trous, le blanc `__________` doit être placé à la position grammaticale exacte du mot manquant dans l'ordre hébreu de droite à gauche — jamais forcé à droite par défaut.

---

### `POST /api/admin-questions`

CRUD + IA pour la banque de questions. Toutes les actions passent par le même endpoint via le champ `action`.

| Action | Paramètres | Description |
|---|---|---|
| `lister` | — | Questions en statut `candidate`, ordre décroissant |
| `lister_toutes` | — | Toutes questions tous statuts (pour les stats) |
| `valider` | `id` | Passe la question en statut `validée` |
| `commenter` | `id`, `commentaire` | Correction Claude + re-sauvegarde en statut `candidate` |
| `generer` | `section`, `nombre`, `niveau` | Pipeline 2 étapes (génération + vérification) + insert Supabase |

**Pipeline `generer` (2 appels Claude) :**
1. Claude génère `nombre` questions selon section/niveau
2. Claude vérifie chaque question : hébreu correct, clarté, distracteurs pertinents, feedback pédagogique → rapport `{ valide, problemes[], suggestion }`
3. Questions + rapports sauvegardés en Supabase avec statut `candidate`

**Correction `commenter` :**
1. Récupère la question existante depuis Supabase
2. Appelle Claude avec la question originale + commentaire admin → Claude retourne la version corrigée
3. Met à jour la question en base + historique des commentaires

---

## Variables d'environnement (Vercel)

| Variable | Usage |
|---|---|
| `ANTHROPIC_API_KEY` | Toutes les routes API (`translate`, `ocr`, `conjugaison`, `generate-test`, `admin-questions`) |
| `SUPABASE_URL` | URL de l'instance Supabase |
| `SUPABASE_ANON_KEY` | Clé publique Supabase (utilisée aussi comme Bearer token) |

---

## Modèle IA

Toutes les routes utilisent **`claude-haiku-4-5-20251001`**.

Pattern de parsing systématique pour les réponses JSON :
```js
data.content[0].text.replace(/```json|```/g, '').trim()
```

---

## Niveaux de difficulté N1–N6

| Niveau | Label | Description |
|---|---|---|
| N1 | Ultra-courant | Mots de base : שלום, מים, בית, תודה |
| N2 | Quotidien simple | Vocabulaire quotidien, salutations, besoins essentiels |
| N3 | Phrases courtes | Verbes courants au présent et passé simple |
| N4 | Grammaire intermédiaire | Binyanim courants : פָּעַל, פִּעֵל, הִפְעִיל, temps multiples |
| N5 | Vocabulaire soutenu | Textes complexes, constructions syntaxiques élaborées |
| N6 | Littéraire | Formes rares, style soutenu, nuances stylistiques |

---

## Schéma Supabase — table `questions`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `section` | text | `vocab`, `gram`, `comp` |
| `badge` | text | Libellé affiché dans l'UI |
| `niveau` | int | 1–6 |
| `text` | text | Énoncé en français |
| `he` | text | Mot ou phrase en hébreu (peut être vide) |
| `options` | jsonb | Tableau de 4 options string |
| `correct` | int | Index 0–3 de la bonne réponse |
| `feedback` | text | Explication pédagogique |
| `statut` | text | `candidate`, `validée`, `à corriger` |
| `commentaires` | jsonb | Historique — voir types ci-dessous |
| `created_at` | timestamp | Auto-généré |
| `updated_at` | timestamp | Mis à jour manuellement à chaque PATCH |

**Types de commentaires dans `commentaires[]` :**
- `rapport_pedagogique` — généré automatiquement après la génération, contient `{ valide, problemes[], suggestion }`
- `admin` — commentaire saisi manuellement via le back-office, contient `{ text }`
- `correction_claude` — marqueur de correction automatique Claude, contient `{ text: "Question corrigée automatiquement par Claude" }`
- `utilisateur` — réservé pour les futurs retours utilisateurs, contient `{ text }`

---

## Backlog — fonctionnalités à venir

### Comptes utilisateurs & authentification
- **Google Auth** via Supabase Auth (OAuth Google) — connexion sans mot de passe
- Profil utilisateur lié à Supabase (`users` table ou `auth.users`)
- Persistance des préférences (niveau habituel, langue d'interface)

### Historique de lecture
- Sauvegarde des textes analysés par l'utilisateur (titre, extrait, date, langue)
- Page "Historique" listant les textes récents avec possibilité de les rouvrir
- Statistiques personnelles : mots consultés, verbes conjugués, scores aux tests

### Favoris & vocabulaire personnel
- Possibilité de sauvegarder un mot analysé dans une liste de favoris
- Page "Mes mots" : liste des mots favoris avec traduction, racine, contexte d'origine
- Export possible (CSV ou flashcards)

### Exercices (onglet prévu dans la nav)
- Exercices de mémorisation basés sur les mots favoris de l'utilisateur
- Flashcards hébreu → français et français → hébreu
- Système de répétition espacée (SRS)
