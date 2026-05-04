# Lamed — Documentation du projet

## Vue d'ensemble

**Lamed** (לָמַד, « apprendre » en hébreu) est une application web d'apprentissage de l'hébreu moderne israélien destinée aux francophones. Elle permet de lire des textes hébreux mot à mot avec analyse linguistique à la demande, de passer un test de niveau, et dispose d'un back-office pour gérer une base de questions pédagogiques.

**Stack :**
- Frontend : HTML/CSS/JS vanilla (pas de framework)
- Backend : fonctions serverless Vercel (ES modules, `export default`)
- IA : Claude Haiku (`claude-haiku-4-5-20251001`) pour toutes les tâches IA
- Base de données : Supabase (PostgreSQL) — uniquement pour les questions du back-office
- Déploiement : Vercel (routing automatique `api/*.js` → `/api/*`)

---

## Structure des fichiers

```
lamed/
├── index.html          # Interface principale de lecture
├── admin.html          # Back-office de gestion des questions
├── test-niveau.html    # Test de niveau (25 questions générées dynamiquement)
└── api/
    ├── translate.js        # Traduction mot + analyse linguistique + traduction complète
    ├── ocr.js              # Extraction de texte hébreu depuis une image
    ├── conjugaison.js      # Conjugaisons complètes d'un verbe hébreu
    ├── generate-test.js    # Génération d'un test de niveau complet (25 questions)
    └── admin-questions.js  # CRUD questions + génération + correction IA (Supabase)
```

---

## Pages

### `index.html` — Lecture interactive

Flux principal :
1. L'utilisateur colle un texte hébreu ou importe une photo
2. `afficherTexte()` nettoie les niqqoud (U+0591–U+05C7), découpe par lignes et mots, rend chaque mot en `<span class="word">` cliquable, avec `<br>` entre les lignes
3. Au clic sur un mot → `traduire()` appelle `/api/translate` et affiche le panneau latéral
4. Bouton "Traduction" → `basculerTraduction()` appelle `/api/translate` (type `traduction_complete`) et affiche le texte traduit
5. Si le mot est un verbe (`json.estVerbe === true`) → bouton "📊 Conjugaisons →" → `afficherConjugaisons()` appelle `/api/conjugaison` et ouvre le panneau de conjugaisons par-dessus

**Panneaux :**
- `#sidePanel` (`.side-panel`) : panneau latéral fixe à droite, largeur 0 → 320px, contient traduction, badges, racine, analyse, et le bouton conjugaisons si verbe
- `#conjPanel` (`.conj-panel`) : panneau conjugaisons fixe à droite, `z-index: 200`, par-dessus le panneau latéral — s'ouvre à la demande

**OCR (`ocrPhoto`) :**
- Lit le fichier image en base64 via `FileReader`
- Envoie à `/api/ocr`
- L'input file n'a PAS `capture="environment"` → l'utilisateur peut choisir entre appareil photo et photothèque

### `admin.html` — Back-office

- Génère des questions via `/api/admin-questions` (action `generer`) avec choix de section (vocab/gram/comp), niveau N1–N6, et nombre
- Affiche les questions en statut `candidate` avec leur rapport pédagogique automatique
- Actions : **Valider** (statut → `validée`) ou **Corriger** (commentaire admin + re-génération Claude)
- Stats en temps réel : total / à valider / validées / à corriger

### `test-niveau.html` — Test de niveau

- Appel unique à `/api/generate-test` au démarrage pour générer 25 questions fraîches
- Niveau configurable N1–N6 (défaut N3)
- 3 sections : 10 vocab + 10 grammaire + 5 compréhension
- Résultats affichés par section avec score et barre de progression
- Évaluation narrative du niveau global

---

## API serverless

### `api/translate.js`

**POST** `/api/translate`

Paramètres :
- `type: 'mot'` — analyse d'un mot dans son contexte
  - `mot` : le mot cliqué
  - `texte` : le texte complet (pour le contexte)
  - Retourne (via Claude, emballé dans `data.content[0].text`) :
    ```json
    {
      "traduction": "...",
      "badges": ["nature", "genre/temps"],
      "racine": "3 lettres + sens",
      "analyse": "explication linguistique",
      "estVerbe": true/false,
      "infinitif": "forme לִ... ou null"
    }
    ```
- `type: 'traduction_complete'` — traduction libre du texte entier
  - `texte` : le texte hébreu complet
  - Retourne directement le texte traduit dans `data.content[0].text`

### `api/ocr.js`

**POST** `/api/ocr`

Paramètres : `image` (base64), `mediaType` (ex. `image/jpeg`)

Retourne : `{ texte: "..." }` — le texte hébreu extrait, avec retours à la ligne préservés

### `api/conjugaison.js`

**POST** `/api/conjugaison`

Paramètres : `verbe` (infinitif hébreu, ex. `לִכְתֹּב`)

Retourne :
```json
{
  "infinitif": "...",
  "present":  { "ani_m": "", "ani_f": "", "ata": "", "at": "", "hou": "", "hi": "", "anahnou_m": "", "anahnou_f": "", "atem": "", "aten": "", "hem": "", "hen": "" },
  "passe":    { même structure },
  "futur":    { même structure }
}
```

Affichage dans le panneau : colonnes ordre = **Masc / Fém / Pronom**, sections bilingues (Présent / הווה, Passé / עבר, Futur / עתיד).

### `api/generate-test.js`

**POST** `/api/generate-test`

Paramètres : `niveau` (1–6, défaut 3)

Retourne : `{ questions: [...], niveau }` — tableau de 25 questions JSON structurées.

### `api/admin-questions.js`

**POST** `/api/admin-questions`

Actions :
- `lister` → questions en statut `candidate` (ordre décroissant)
- `lister_toutes` → toutes questions tous statuts (pour les stats)
- `valider` (`id`) → passe la question en statut `validée`
- `commenter` (`id`, `commentaire`) → correction automatique Claude + mise à jour Supabase
- `generer` (`section`, `nombre`, `niveau`) → génération en 2 étapes : génération + vérification pédagogique, puis sauvegarde en Supabase

**Pipeline génération (2 étapes Claude) :**
1. Claude génère `nombre` questions de la section/niveau demandés
2. Claude vérifie chaque question (hébreu correct, clarté, distracteurs, feedback) et produit un rapport `{ valide, problemes, suggestion }`
3. Questions + rapports sauvegardés en Supabase avec statut `candidate`

---

## Variables d'environnement (Vercel)

| Variable | Usage |
|---|---|
| `ANTHROPIC_API_KEY` | Toutes les routes API Claude |
| `SUPABASE_URL` | URL de l'instance Supabase |
| `SUPABASE_ANON_KEY` | Clé publique Supabase (anon) |

---

## Modèle IA

Toutes les routes utilisent **`claude-haiku-4-5-20251001`**.

Toutes les réponses Claude sont parsées depuis `data.content[0].text` avec nettoyage des backticks markdown :
```js
texte.replace(/```json|```/g, '').trim()
```

---

## Niveaux de difficulté

| Niveau | Description |
|---|---|
| N1 | Mots ultra-courants (שלום, מים, בית, תודה) |
| N2 | Vocabulaire quotidien simple, salutations |
| N3 | Phrases courtes, verbes courants (présent + passé) |
| N4 | Grammaire intermédiaire, binyanim (פָּעַל, פִּעֵל, הִפְעִיל) |
| N5 | Vocabulaire soutenu, constructions syntaxiques élaborées |
| N6 | Registre littéraire, formes rares, nuances stylistiques |

---

## Schéma Supabase — table `questions`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `section` | text | `vocab`, `gram`, `comp` |
| `badge` | text | Libellé affiché |
| `niveau` | int | 1–6 |
| `text` | text | Énoncé de la question en français |
| `he` | text | Mot ou phrase en hébreu (peut être vide) |
| `options` | jsonb | Tableau de 4 options |
| `correct` | int | Index 0–3 de la bonne réponse |
| `feedback` | text | Explication pédagogique |
| `statut` | text | `candidate`, `validée`, `à corriger` |
| `commentaires` | jsonb | Tableau d'objets `{ type, text/valide/problemes/suggestion, date }` |
| `created_at` | timestamp | Auto |
| `updated_at` | timestamp | Mis à jour manuellement |

Types de commentaires : `rapport_pedagogique` (généré auto), `admin` (saisi manuellement), `correction_claude` (généré après correction).
