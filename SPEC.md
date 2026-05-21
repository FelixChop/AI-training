# focus — Specification

> **Document de référence pour le développement.** Cette spec est destinée à être lue par Claude Code (ou tout LLM-codeur) avant et pendant l'implémentation. Elle est volontairement dense et opinionée. En cas de doute pendant l'implémentation, consulter ce fichier avant de prendre une initiative.

-----

## 1. Pitch

**focus** est un serveur MCP (Model Context Protocol) local qui transforme n'importe quel outil IA agentique (Claude, ChatGPT, Gemini, Mistral, Copilot, OpenCode…) en chef de projet personnel.

Une fois installé sur l'outil IA de l'utilisateur, focus construit une connaissance fine du contexte (stakeholders, style, objectifs, projets) en scannant l'historique de communication, puis sert de **mémoire et orchestrateur** pour générer des tableaux de todo priorisés et exécuter des actions communicationnelles dans le style de l'utilisateur.

focus ne contient **aucune intelligence** au sens LLM. Toute la cognition vient de l'outil IA hôte. focus fournit la **persistance** (knowledge base + todo), la **structure** (modèle de données, statuts d'actions), et la **coordination** (locks multi-conversation, déblocage automatique d'actions). C'est une couche de plomberie intelligente, pas un agent.

-----

## 2. Principes directeurs

1. **Full local.** Aucune donnée utilisateur ne quitte sa machine. Pas de SaaS, pas de cloud, pas de télémétrie. Seul appel sortant autorisé : vérification de version vers GitHub Releases.
2. **Agnostique au modèle.** focus n'appelle jamais d'API LLM directement. Il est invoqué par l'outil IA de l'utilisateur via le protocole MCP.
3. **Minimaliste en surface.** ~12 tools MCP, pas plus. Toute fonctionnalité qui peut être déléguée à l'outil IA hôte doit l'être.
4. **Toujours validable.** Aucune action externe (envoi de mail, message Teams) n'est exécutée sans validation explicite de l'utilisateur. focus ne fait que **proposer** et **persister le statut**.
5. **Évolutif silencieusement.** La knowledge base s'enrichit au fil des interactions, sans demander à l'utilisateur de remplir des formulaires.
6. **Distribution npm.** Installation via `npx @felixchop/focus`. Aucune dépendance Python, Docker ou autre.

-----

## 3. Stack technique

- **Langage** : TypeScript (Node.js ≥ 20)
- **SDK MCP** : `@modelcontextprotocol/sdk` (officiel Anthropic)
- **Transport** : stdio (le standard MCP pour les serveurs locaux)
- **Stockage** :
  - SQLite (`better-sqlite3`) pour les données opérationnelles
  - Fichiers `.md` pour la knowledge base (lisibles humainement, éditables)
- **Distribution** : npm, commande `npx @felixchop/focus`
- **Tests** : `vitest`
- **Lint/format** : `biome` (préféré à eslint+prettier pour la simplicité)

-----

## 4. Structure du repo

```
focus/
├── README.md                          # vitrine publique
├── CHANGELOG.md                       # release notes rédigées avec voix perso
├── SPEC.md                            # ce document
├── LICENSE                            # MIT
├── package.json
├── tsconfig.json
├── biome.json
├── src/
│   ├── server.ts                      # entry point MCP
│   ├── version.ts                     # constante VERSION
│   ├── paths.ts                       # résolution ~/.focus/ et sous-dossiers
│   ├── db/
│   │   ├── schema.ts                  # création des tables SQLite
│   │   ├── migrations.ts              # migrations versionnées
│   │   └── client.ts                  # wrapper better-sqlite3
│   ├── models/
│   │   ├── todo.ts                    # types TodoItem, Action
│   │   ├── reference.ts               # types pour la knowledge base
│   │   └── status.ts                  # enums et constantes
│   ├── tools/
│   │   ├── index.ts                   # registry de tous les tools
│   │   ├── todo.ts                    # get_current_todo, save_todo, claim_item, mark_action_status
│   │   ├── references.ts              # list_references, read_reference, suggest_reference_update
│   │   ├── bootstrap.ts               # bootstrap, status
│   │   ├── catalog.ts                 # recommend_mcps
│   │   └── updates.ts                 # check_for_updates
│   ├── catalog/
│   │   └── mcps.yaml                  # catalogue de MCPs recommandables
│   ├── templates/
│   │   ├── objectives.md
│   │   ├── stakeholder.template.md
│   │   ├── project.template.md
│   │   ├── style_guide.template.md
│   │   └── orgchart.template.md
│   ├── instructions/
│   │   ├── bootstrap.md
│   │   ├── todo_generation.md
│   │   └── action_execution.md
│   └── utils/
│       ├── files.ts
│       ├── slug.ts
│       └── locks.ts
├── tests/
│   ├── tools.test.ts
│   ├── db.test.ts
│   └── locks.test.ts
└── docs/
    ├── install.md
    ├── bootstrap.md
    └── architecture.md
```

-----

## 5. Modèle de données

### 5.1 Localisation des données

Toutes les données utilisateur vivent dans `~/.focus/` (résolu via `os.homedir()`).

```
~/.focus/
├── focus.db
├── reference/
│   ├── objectives.md
│   ├── orgchart.md
│   ├── style_guide.md
│   ├── stakeholders/<slug>.md
│   └── projects/<slug>.md
├── logs/
│   ├── bootstrap.log
│   └── tools.log
└── meta.json
```

### 5.2 Tables SQLite

```sql
CREATE TABLE todo_items (
  id TEXT PRIMARY KEY,
  rank INTEGER NOT NULL,
  project TEXT NOT NULL,
  priority TEXT NOT NULL,
  context TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_status ON todo_items(status);
CREATE INDEX idx_rank ON todo_items(rank);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 5.3 TodoItem (TypeScript)

```ts
type Action = {
  id: string;
  label: string;
  type: 'message' | 'document' | 'validation' | 'meeting' | 'research' | 'other';
  status: 'actionable' | 'blocked' | 'in_progress' | 'done' | 'cancelled';
  depends_on: string[];
  blocked_reason?: string;
  evidence?: {
    type: 'email' | 'teams' | 'manual' | 'inferred';
    ref?: string;
    note?: string;
    timestamp: string;
  };
};

type Source = {
  type: 'email' | 'teams' | 'slack' | 'drive' | 'calendar' | 'notion' | 'other';
  ref: string;
  description: string;
  date: string;
};

type TodoItem = {
  id: string;
  rank: number;
  project: string;
  priority: 'P0' | 'P1' | 'P2';
  context: string;
  sources: Source[];
  actions: Action[];
  status: 'open' | 'archived';
  claimed_by: string | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};
```

### 5.4 Format des fichiers de référence

Frontmatter YAML + corps markdown libre. Le frontmatter est minimal, le corps est riche. Voir `src/templates/*.md` pour les squelettes.

-----

## 6. Tools MCP exposés (12)

Tous les tools retournent du JSON. En cas d'erreur : throw avec message en langage naturel + code structuré.

### 6.1 `bootstrap`
- **Input** : `{ scan_depth_months: number }` (défaut 1, max 24, -1 pour all)
- Écrit `meta.bootstrap_status = 'in_progress'`, retourne `{ status, instructions_path, available_mcps_detected, recommended_steps }`.
- Le scan est délégué à l'outil IA hôte.

### 6.2 `status`
- Retourne `bootstrap_status`, `last_bootstrap_at`, `todo_items_count`, comptages de références, `version`, `meta_path`.

### 6.3 `get_current_todo`
- **Input** : `{ include_archived?, include_actions_blocked? }`
- Retourne `{ items, generated_at, last_updated_at }`.

### 6.4 `save_todo`
- **Input** : `{ items: Partial<TodoItem>[], merge_mode: 'upsert' | 'replace' }`
- Upsert intelligent : préserve `status`/`claimed_by`/`locked_until` au niveau item, `status`/`evidence` au niveau action ; jamais de suppression silencieuse d'actions.

### 6.5 `claim_item`
- **Input** : `{ item_id, conversation_id, ttl_seconds? }`
- Transaction atomique. Throw `TASK_LOCKED` si déjà claimed par une autre conversation et lock encore valide.

### 6.6 `release_item`
- **Input** : `{ item_id, conversation_id }`
- Libère le lock si la conversation correspond.

### 6.7 `mark_action_status`
- **Input** : `{ item_id, action_id, new_status, evidence? }`
- Cascade : si done → actions dépendantes voient leurs deps évaluées, flip `blocked` → `actionable` si toutes les deps sont done.

### 6.8 `list_references`
- **Input** : `{ category? }`
- Liste les `.md` de `~/.focus/reference/` avec frontmatter parsé.

### 6.9 `read_reference`
- **Input** : `{ path }`
- Retourne `{ frontmatter, body, raw }`.

### 6.10 `suggest_reference_update`
- **Input** : `{ path, content, reason, create_if_missing? }`
- Pendant bootstrap (`bootstrap_status === 'in_progress'`) : écrit directement (`status: 'applied'`).
- Sinon : écrit `<path>.pending.md` (`status: 'pending'`) + `diff_summary`.

### 6.11 `recommend_mcps`
- **Input** : `{ user_tools? }`
- Lit `src/catalog/mcps.yaml`, retourne le catalogue (filtré si `user_tools`).

### 6.12 `check_for_updates`
- Appel GET `https://api.github.com/repos/felixchop/focus/releases/latest`. Timeout 5s. Cache 1h dans `meta`.
- En erreur : retourne `{ update_available: false, latest_version: null }` silencieusement.

-----

## 7. Flux d'utilisation

### 7.1 Installation initiale
1. User ajoute focus à son outil IA via la doc.
2. Outil IA appelle `status()`.
3. Si `not_started`, propose le bootstrap → `bootstrap({ scan_depth_months: 1 })`.
4. focus retourne les instructions, l'outil IA fait le scan en autonomie.
5. Plusieurs `suggest_reference_update` puis `save_todo`.
6. Outil IA marque `bootstrap_status: 'complete'`.

### 7.2 Usage quotidien — "fais ma todo"
1. `get_current_todo()`.
2. Outil IA scanne les MCPs métier depuis `last_updated_at`.
3. Pour chaque événement : enrichit / débloque / marque done / crée.
4. `save_todo(upsert)`.
5. Présente le tableau (actionable + blocked).

### 7.3 Usage quotidien — "ok go"
Pour chaque action sélectionnée : `claim_item` → lit stakeholder + style_guide → génère draft → user OK → exécute via MCP métier → `mark_action_status(done, evidence)` → cascade éventuelle.

### 7.4 Inférence contextuelle de déblocage
L'outil IA évalue sémantiquement si un nouvel événement satisfait un `blocked_reason`. focus ne fait que stocker le `blocked_reason`.

### 7.5 Stratégie d'incrémentalité (v1)
Pas de daemon. focus est instancié par l'outil IA à chaque session. Polling au démarrage. Pas de webhooks en v1 publique.

-----

## 8. Mise à jour de focus

- Détection : `check_for_updates()` au démarrage (cache 1h).
- Présentation : l'outil IA hôte invite l'user, présente le changelog.
- Application : focus **ne se met pas à jour lui-même** — affiche la commande npm.
- Migrations : comparaison `meta.schema_version` ↔ code, exécution dans l'ordre.
- Templates : jamais touchés automatiquement (roadmap v1.2).

-----

## 9. Comportements transversaux

### 9.1 Logging
JSONL dans `~/.focus/logs/tools.log` : timestamp, tool, input tronqué (mails à 100 chars), output summary, duration_ms, error si applicable. `bootstrap.log` séparé, plus verbeux.

### 9.2 Erreurs
Codes : `TASK_LOCKED`, `NOT_FOUND`, `BOOTSTRAP_INCOMPLETE`, `INVALID_INPUT`, `IO_ERROR`, `MIGRATION_REQUIRED`.

### 9.3 Concurrence
Transactions SQLite + `proper-lockfile` sur les écritures .md.

### 9.4 Sécurité
- Aucune écriture hors `~/.focus/`.
- Validation stricte des paths (rejet `..`).
- Pas d'exécution de code arbitraire.
- Pas d'HTTP sortant sauf `check_for_updates` vers `api.github.com`.

-----

## 10. README et CHANGELOG

### 10.1 README
1. GIF démo (post-MVP).
2. Tagline : *"Your AI tool, turned into a true chief of staff. Local. Private. Open source."*
3. Pitch 3 lignes.
4. Quickstart (snippet config MCP).
5. Premier usage.
6. Matrice outils IA supportés.
7. MCPs métier recommandés.
8. Lien bootcamp.

### 10.2 CHANGELOG (voix personnelle)
Format : `## v0.X.0 — YYYY-MM-DD`, sections `### Nouveau / Amélioré / Corrigé / Réflexion du moment`. La "Réflexion" fait 150-300 mots, voix personnelle de Félix.

-----

## 11. Catalogue MCPs

`src/catalog/mcps.yaml` — au minimum gmail, outlook, teams, slack, drive, calendar, notion. Maintenu à la main.

-----

## 12. Tests

Unitaires : `db`, `locks`, `tools`, `merge`, `cascade`. Intégration : 1 scénario complet (bootstrap → suggest_reference_update → save_todo → claim_item → mark_action_status avec cascade → get_current_todo).

-----

## 13. Roadmap post v1

- v1.1 : `confirm_reference_update`.
- v1.2 : `diff_templates`.
- v1.3 : mode "watch" (daemon).
- v2.0 : multi-user.

-----

## 14. Critères d'acceptation v1

- [ ] `npx @felixchop/focus` lance le serveur sans erreur.
- [ ] 12 tools exposés.
- [ ] User suit le quickstart README et arrive à une première todo en < 30 min.
- [ ] Tests verts en CI.
- [ ] README + CHANGELOG rédigés.
- [ ] Catalogue inclut gmail, outlook, teams, slack, drive, calendar, notion.
- [ ] `docs/install.md` et `docs/bootstrap.md` rédigés.

-----

## 15. Anti-objectifs

- ❌ Pas de UI.
- ❌ Pas d'OAuth ni gestion d'identité.
- ❌ Pas de planification auto (cron).
- ❌ Pas de notifications push.
- ❌ Pas de fonctionnalités collaboratives en v1.
- ❌ Pas de marketplace.
- ❌ Pas d'analytics ni télémétrie.

-----

## Fin de spec.

Pour toute ambiguïté : privilégier **la simplicité** et la **séparation des responsabilités** (focus = persistance et structure, outil IA hôte = intelligence et orchestration).
