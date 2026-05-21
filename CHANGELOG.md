# Changelog

## v0.1.0 — 2026-05-21

Première version publique de focus. C'est l'os de la bête : un serveur MCP
local en TypeScript qui sait persister une todo, gérer une knowledge base
en markdown, et tenir les locks entre conversations. La cognition reste
côté outil IA hôte ; focus ne fait que la plomberie.

### Nouveau
- Serveur MCP `npx @felixchop/focus` en transport stdio.
- 12 tools exposés : `status`, `bootstrap`, `list_references`,
  `read_reference`, `suggest_reference_update`, `save_todo`,
  `get_current_todo`, `claim_item`, `release_item`, `mark_action_status`,
  `recommend_mcps`, `check_for_updates`.
- Stockage SQLite (`better-sqlite3`) + knowledge base en `.md` avec
  frontmatter YAML, le tout dans `~/.focus/`.
- Système de migrations versionnées (v1 = schéma initial).
- Cascade automatique de déblocage d'actions quand une dépendance passe
  `done`.
- Lock multi-conversation atomique avec TTL.
- Catalogue versionné de MCPs métier recommandés (gmail, outlook, teams,
  slack, drive, calendar, notion, confluence).
- Vérification d'updates en arrière-plan (cache 1h, silencieuse en cas
  d'erreur réseau).

### Réflexion du moment

Je voulais bâtir ce truc depuis longtemps. Quand je dois choisir entre
ajouter une fonctionnalité à un outil et écrire un peu de code pour qu'un
LLM s'en charge à ma place, je trouve toujours la deuxième option plus
satisfaisante — même quand elle prend plus de temps à court terme.

focus n'est pas un agent. C'est plus modeste : c'est une couche de
mémoire et de coordination, branchée à n'importe quel outil IA qui parle
MCP. Le pari, c'est que la cognition utile pour un *chief of staff*
personnel — savoir qui est qui, lire un mail entre les lignes, choisir le
ton — est déjà là dans les modèles. Ce qui manque, c'est le contexte
durable et la coordination entre conversations. Ça, focus le fait.

La v0.1 est volontairement minimale : pas de daemon, pas de webhooks, pas
d'UI. Le scan se fait en interactif avec votre outil IA. Quand vous
fermez la conversation, focus reste là, prêt à reprendre à la suivante.

Si vous testez focus, je veux savoir ce qui coince : ouvrez une issue, ou
écrivez-moi. Les choix d'API et de modèle de données ne sont pas figés —
ils sont juste un point de départ assez bien réfléchi pour qu'on puisse
parler de l'expérience plutôt que de la plomberie.

— Félix
