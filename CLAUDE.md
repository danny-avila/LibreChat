# Vermeer Chat — Mémoire projet

Mémoire institutionnelle du projet Vermeer Chat, à destination de tout nouveau lecteur (humain ou IA). Ce fichier est **stratégique** : contexte, stack, conventions, décisions, garde-fous, état d'avancement. Il ne contient pas l'historique détaillé des décisions et conversations — celui-ci est tracké sur Notion.

Dernière mise à jour : 2026-05-27 (soir) — HEAD `a98a8d6cd`.

La Partie 1 ci-dessous couvre le projet Vermeer. La [Partie 2](#partie-2--conventions-techniques-librechat) reprend les conventions techniques LibreChat (workspaces, code style, tests) — à lire après le contexte projet.

## Sommaire (Partie 1)

1. Vue d'ensemble
2. Stack technique
3. Équipe et rôles
4. Conventions de code et de workflow
5. Décisions architecturales clés
6. Garde-fous
7. État actuel V1
8. Roadmap V1 / V2 / V3
9. Limitations connues et travaux en cours
10. Documentation et ressources externes
11. Risques techniques connus

---

## 1. Vue d'ensemble

Vermeer Chat est un **fork de LibreChat (base v0.8.5)** adapté pour un usage interne agence. Ce n'est pas un produit développé de zéro : on étend LibreChat upstream en personnalisant l'UX, le design et la configuration, et en activant progressivement les capacités natives.

- **Pour qui** : les équipes **BETC Fullsix** et **POP** (Proseonpixels). Les utilisateurs sont organisés en 2 groupes BETC et POP au sein d'une instance unique (voir décision 5.3).
- **Promesse produit** : un assistant IA d'entreprise premium, francisé et orienté métier agence, donnant accès aux modèles Anthropic et OpenAI dans un cadre authentifié et sécurisé, avec agents, mémoire et recherche de fichiers.

Le repo a deux remotes : `origin` (Vermeer) et `upstream` (LibreChat officiel). On rebase/merge depuis `upstream` pour suivre les versions amont.

## 2. Stack technique

- **Backend** : Express (`/api`, JS legacy à toucher au minimum) + packages TypeScript (`packages/api`, `packages/data-schemas`, `packages/data-provider`). Dépendance majeure `@librechat/agents`.
- **Frontend** : SPA React/TypeScript (`/client`) + `packages/client`. i18n via `useLocalize()`.
- **Auth** : email/mot de passe. SSO/social login désactivés (`ALLOW_SOCIAL_LOGIN=false`, `registration.socialLogins: []`). Inscription ouverte en dev (`ALLOW_REGISTRATION=true`).
- **Base de données** : MongoDB (`mongodb://127.0.0.1:27017/LibreChat` en local). Recherche full-text via Meilisearch.
- **Stockage fichiers** : S3 (`fileStrategy: "s3"`, bucket AWS `eu-west`). Azure Storage également configuré.
- **Modèles consommés** (via `.env`) :
  - Anthropic : `claude-opus-4-6`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`
  - OpenAI : `gpt-5.2`, `gpt-5.1`, `gpt-5-mini`, `gpt-4o`
  - Endpoint custom `French Models` (Featherless) défini dans `librechat.yaml`.

### Lancer le projet en local

Prérequis : Node.js (v20.19+ / v22.12+ / >=23) et MongoDB. Sur macOS, MongoDB s'installe via Homebrew (`brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`).

```bash
npm run backend:dev     # backend Express avec watch (port 3080)
npm run frontend:dev    # frontend Vite/HMR (port 3090, requiert le backend)
```

Backend : `http://localhost:3080/`. Frontend dev : `http://localhost:3090/`. Le détail des commandes de build et la structure des workspaces sont en Partie 2.

## 3. Équipe et rôles

Interlocuteurs directs côté technique :

- **Loïse Toscer** — PMO du projet, pilote produit + app builder. Écrit le code en collaboration avec Claude Code.
- **Antoine** — directeur Studio IA, pilote l'architecture technique. Valide les décisions structurantes (config, déploiement, choix d'archi) ; c'est lui qui valide les choix techniques de fond.

Contributions ponctuelles à venir :

- **Adilet** — dev POP, viendra en renfort sur le Credit Management (V2).
- **Oussama** (sous **Aurélie**) — dev POP, pilotera le branchement du déploiement staging/prod.

Les autres intervenants (UX, chefferie de projet, business, PMO BETC, documentation) relèvent du pilotage humain de Loïse et ne concernent pas le travail technique.

## 4. Conventions de code et de workflow

- **Branches** : aujourd'hui `main` uniquement côté `origin`. Mise en place d'environnements staging/prod en cours via Oussama. **À CONFIRMER** : état réel des branches staging/prod.
- **Commits** : convention `type(scope): sujet` en français (ex. `feat(ux/agents): …`), corps détaillé en français expliquant le pivot et les hors-scope, signature `Co-Authored-By: Claude Opus 4.7`.
- **Méthode de travail** : approche **Phase 1 (investigation) → Phase 2 (plan) → Phase 3 (exécution)** avec validation explicite entre chaque phase pour tout chantier conséquent (voir garde-fou dédié section 6).
- **Design system Vermeer V1** : dark mode global par défaut (forcé via `FORCE_VERMEER_DARK=true`), accent rouge Vermeer `#E5384A` (hover `#C52838`), fond noir principal `#0A0A0B` (`--surface-primary`) avec surfaces anthracite `#141416` / `#1A1A1C`. Variables définies dans la section `.dark` de `client/src/style.css`. Valeurs V1 best-guess, à raffiner en atelier specs avec Antoine.
- **Posture éditoriale** : premium, registre « atelier d'art ». Wordings francisés et orientés métier agence. L'IA parle à la première personne (« Comment veux-tu que je t'appelle ? »).
- Les conventions de code détaillées (nommage, typage, imports, perf) sont en Partie 2 et s'appliquent intégralement.

## 5. Décisions architecturales clés

Chaque décision est donnée au format **Décision → Pourquoi → Conséquence pratique**.

**5.1 Extension de LibreChat plutôt que développement from-scratch**
- Pourquoi : environ 50 % des fonctionnalités visées (dont le credit management) sont déjà natives dans LibreChat.
- Conséquence pratique : pour tout nouveau besoin, vérifier d'abord ce qui existe nativement dans LibreChat upstream avant d'envisager du custom.

**5.2 Credit management via le système natif LibreChat**
- Pourquoi : LibreChat fournit déjà `balance`, `autoRefill`, le tracking de tokens et le hard block ; réimplémenter serait redondant et risqué.
- Conséquence pratique : activer et configurer `balance`/`transactions` dans `librechat.yaml` plutôt que développer un module de crédits maison.

**5.3 Une instance unique avec 2 groupes BETC / POP + config overrides natifs**
- Pourquoi : LibreChat v0.8.5 fait nativement de la séparation par Groups + config overrides DB-backed. Une seule infrastructure à maintenir, partage cross-BU possible, users multi-BU possibles, trajectoire alignée sur le natif v0.8.5. (Révise la décision initiale « 2 environnements distincts ».)
- Conséquence pratique : ne pas déployer 2 environnements distincts ; utiliser les Groups et config overrides via l'Admin Panel ClickHouse en V2. L'étanchéité des données BETC vs POP est à valider rigoureusement avant déploiement.

**5.4 Recherche web native des providers (param `web_search` LLM), pas le pipeline tiers LibreChat**
- Pourquoi : il s'agit de la web search **native** des providers (mécanisme natif Anthropic / OpenAI Responses API / Google Grounding), distincte du pipeline tiers LibreChat (Serper/Firecrawl/Jina). On évite la dépendance et le coût des services tiers côté utilisateur.
- Architecture cible — double exposition : (a) web search native providers en toggle utilisateur (livrée V1 dans le panel Paramètres) ; (b) pipeline LibreChat conservé mais **gating ADMIN uniquement**, accessible en paramètres avancés via l'Admin Panel en V2.
- Conséquence pratique : pas de clés tierces (Serper/Firecrawl/Jina) ajoutées en V1 ; Tavily déjà présent reste actif en `.env` mais **inaccessible aux utilisateurs en V1** ; les utilisateurs accèdent à la native via le toggle du panel Paramètres pour Claude et GPT (gated sur endpoints custom).

**5.5 Deux niveaux d'agents : L1 vs L2**
- Pourquoi : distinguer un assistant qui **produit du texte** (L1) d'un agent qui **agit via des outils** (L2) clarifie le périmètre fonctionnel et la roadmap.
- Conséquence pratique : V1 cible le L1 ; le L2 (action via outils) est planifié pour V2 via Codeur (voir roadmap).

**5.6 Système d'admin natif LibreChat plutôt que feature flags hardcodés — trajectoire en 2 temps**
- Pourquoi : les flags `SHOW_*` qui ont un équivalent natif sont des raccourcis temporaires ; l'admin natif (permissions, capabilities) est la voie pérenne et configurable sans redéploiement.
- Trajectoire actée : **V1 (3 juin)** — revert progressif des flags concernés vers le yaml `interface` (étape intermédiaire propre mais legacy upstream). **V2 (mi-juin)** — bascule vers l'**Admin Panel ClickHouse** (service séparé à déployer), cible vraie pour gérer permissions par rôle/groupe avec config overrides DB-backed.
- Conséquence pratique : pour le revert des flags (sujet 2 du retroplanning), appliquer la trajectoire standard V1 yaml + V2 Admin Panel. Seuls les flags à équivalent natif sont concernés (cf. garde-fou §6 et inventaire §7).

## 6. Garde-fous (NE JAMAIS faire sans validation explicite)

Chaque règle est suivie d'un exemple concret de ce qu'il faut éviter.

- **Ne pas pousser sur `main` sans review.** Éviter : `git push origin main` directement après un commit local non relu.
- **Ne pas commit le `.env`.** Éviter : `git add .env` — il contient les clés API (Anthropic, OpenAI, AWS, etc.). Le template versionné est `.env.example`.
- **Ne pas mettre de clés API en clair dans un fichier versionné.** Éviter : coller une clé dans `librechat.yaml` au lieu d'utiliser une variable `${NOM_VAR}`.
- **Ne pas modifier la structure des collections MongoDB existantes** (User, Transactions, Conversations, Messages, Agents). Éviter : renommer/supprimer un champ de `User` — cela casse la migration des données depuis la prod existante.
- **Ne pas ajouter de feature flags hardcodés qui ont un équivalent admin natif.** Si la doc LibreChat propose un toggle équivalent (yaml `interface` ou Admin Panel), reverter/utiliser le natif est **obligatoire** (ex. items sidebar, toggles UI, permissions de feature). Éviter : `const SHOW_NEW_THING = false` pour masquer une feature gérable nativement. **Ne vise PAS** les flags de branding/cosmétique sans équivalent natif (ex. `FORCE_VERMEER_DARK`, `SHOW_LANDING_SUGGESTIONS`, `SHOW_LEGACY_COMPOSER_MENUS`), qui restent légitimement en code et doivent être documentés.
- **Ne pas casser le système d'admin natif LibreChat.** Éviter : court-circuiter une permission (`hasAccessTo…`) par un flag ou une condition en dur.
- **Méthode Phase 1 / 2 / 3 obligatoire pour tout chantier > 50 lignes de code.** Éviter : se lancer dans l'implémentation sans investigation ni plan validé.

## 7. État actuel V1 (refonte UX)

Base LibreChat v0.8.5, HEAD `a98a8d6cd`. La refonte UX V1 est livrée via les commits structurants suivants (12–27 mai 2026) :

- `a3315c1a6` — design system Vermeer : dark mode + accent rouge.
- `cb73a8f7d` — Skills : francisation + bouton « + » scindé en « Créer » / « Importer ».
- `f3a5219c6` — sidebar : items Prompts et MCP masqués via feature flags.
- `daba3523a` — panel Paramètres « light » : sections + tooltips + accordéon avancé.
- `5042144da` — modale Créer une mémoire : vocabulaire humain (Claude-pur).
- `0c91ee7ea` — agents : « Constructeur d'agents » → « Mes agents » + accès Marketplace.
- `57cad180f` — builder agent : réordonnancement + zone d'upload unifiée sous Instructions.
- `a2d14b36d` — picker de modèle : section « Agents » retirée (sélection via le panel « Mes agents »).
- `ca79924db` — landing : 4 cartes de suggestions orientées usages agence.
- `22519dd92` — ajout du CLAUDE.md projet (mémoire institutionnelle).
- `a98a8d6cd` — web search native exposée dans le panel Paramètres pour Claude et GPT, gated sur endpoints custom.

**Couverture des features upstream** (`librechat.yaml`) : activées — agents, marketplace, fileSearch, fileCitations, memory, peoplePicker, presets, prompts, bookmarks, multiConvo, speech (TTS/STT). Non activées — `balance` et `transactions` sont **présents nativement mais laissés commentés en config** ; le système de crédits natif est donc disponible mais pas encore branché (point à acter en V1, voir section 8).

**Feature flags hardcodés — inventaire (audit CC)** : 10 noms distincts / 12 déclarations recensés à l'origine ; après le revert de `a98a8d6cd`, 9 noms / 11 déclarations restent dans le code.

_Catégorie A — équivalent admin natif → à reverter (trajectoire 5.6 : V1 yaml `interface` + V2 Admin Panel). 5 noms / 6 déclarations :_
- `SHOW_PROMPTS_SIDEBAR_ITEM` (`hooks/Nav/useSideNavLinks.ts`)
- `SHOW_MCP_SIDEBAR_ITEM` (`hooks/Nav/useSideNavLinks.ts`)
- `SHOW_PRESETS_BUTTON` (`Chat/Header.tsx`)
- `SHOW_WEB_SEARCH_TOOL` ×2 (`Chat/Input/ActiveToolChips.tsx`, `ToolsMenu.tsx`) — pipeline tiers, cible gating ADMIN (cf. 5.4)
- ~~`SHOW_USER_WEB_SEARCH_SETTING`~~ — **reverté dans `a98a8d6cd`** (web search native exposée) ; il reste donc 4 noms / 5 déclarations à traiter en catégorie A.

_Catégorie B — branding/cosmétique, sans équivalent natif → restent légitimement en code, à documenter. 5 noms / 6 déclarations :_
- `FORCE_VERMEER_DARK` ×2 (`App.jsx`, `General.tsx`)
- `SHOW_LANDING_SUGGESTIONS` (`Chat/Landing/SuggestionGrid.tsx`)
- `SHOW_LEGACY_COMPOSER_MENUS` (`Chat/Input/ChatForm.tsx`)
- `SHOW_AGENT_VARIABLES_BUTTON` (`SidePanel/Agents/Instructions.tsx`)
- `SHOW_AGENT_ID` (`SidePanel/Agents/AgentConfig.tsx`)

## 8. Roadmap V1 / V2 / V3

- **V1 — mercredi 3 juin 2026** : premier déploiement en production + première version du credit management (acter l'activation de `balance`/`transactions` dans `librechat.yaml`).
- **V2 — mi-juin 2026** : intégration des agents L2 via Codeur (environnement sandbox de Damien/Benoit), c'est-à-dire des agents qui agissent via des outils.
- **V3 — à définir** : capacités agentiques étendues, refacturation interne entre BU.

## 9. Limitations connues et travaux en cours

- **Mode comparaison** : le dysfonctionnement observé venait d'une clé OpenAI invalide en local, pas d'un vrai bug applicatif.
- **Recherche web** : native exposée en V1 dans le panel Paramètres (Claude/GPT, cf. `a98a8d6cd`). Le pipeline tiers reste masqué (`SHOW_WEB_SEARCH_TOOL=false`), cible gating ADMIN en V2 (cf. 5.4).
- **RAG vs File context** : l'UX du dispatch entre recherche de fichiers (RAG) et contexte permanent reste à clarifier ; en V1, le builder agent expose une zone d'upload unifiée (RAG par défaut).
- **Feature flags hardcodés** : audit fait (10 noms / 12 déclarations à l'origine, cf. §7). Les flags à équivalent natif suivent la trajectoire 5.6 (V1 yaml + V2 Admin Panel) ; les flags branding/cosmétique restent documentés en code.
- **RAG API non opérationnelle en V1** : `RAG_API_URL` est undefined dans le `.env`. File Search est exposée dans l'UI builder agent mais l'indexation échoue silencieusement (warning dans les logs backend). À activer en V1 : lancer le conteneur RAG API (port 8000 + PostgreSQL/PGVector), définir `RAG_API_URL`, vérifier les embeddings OpenAI déjà câblés (`RAG_OPENAI_API_KEY` présent). À coordonner avec Oussama (infra Docker / déploiement).
- **Gap UX boutons d'upload** : LibreChat upstream propose 4 modes (Upload Images, Upload as Text/File Context, Upload for File Search/RAG, Upload for Code Interpreter). Vermeer V1 n'expose qu'un bouton « joindre un fichier » (= File Context) ; les 3 autres modes sont absents de l'UI. À enrichir en V1/V1.1 pour bénéficier du RAG et du Code Interpreter une fois activés.
- **Builder agent — web search native non exposée** : l'accordéon « Recherche web » du builder pointe vers le pipeline tiers (trop technique pour les users). La native (param `web_search`, livrée V1 dans le panel Paramètres de la conversation) n'est pas exposable simplement dans le builder — upstream ne propose pas de capability « web search native » au niveau agent. Sujet V1.1+ : investiguer le stockage de `web_search` dans la config d'un agent + exposition builder (chantier custom potentiellement non trivial).

## 10. Documentation et ressources externes

- Doc LibreChat upstream : https://www.librechat.ai/docs
- Token usage : https://www.librechat.ai/docs/configuration/token_usage
- Notion projet (privé) — historique détaillé des décisions et conversations.
- Documentation utilisateur Vermeer Chat V1 (document Word, en cours, par Nolan).

## 11. Risques techniques connus

- **Fail-fast yaml** : toute erreur de validation dans `librechat.yaml` fait sortir le process en code 1 (boot cassé, pas de mode dégradé). Tester systématiquement le yaml en local avant tout déploiement prod (un yaml invalide = appli down).
- **`balance.enabled` force `transactions.enabled`** : activer le bloc `balance` réécrit automatiquement `transactions` à true quelle que soit sa valeur. Le solde a besoin de l'historique, c'est by-design.
- **Pricing en dur dans `api/models/tx.js`** : les rates input/completion par modèle vivent dans ce fichier, pas dans le yaml. Avant d'activer la balance en V1, vérifier que les modèles utilisés (gpt-5.x, claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5) ont un rate défini, sinon la consommation n'est pas trackée.
- **Synchro balance au login** : le solde se réaligne sur la config globale (`startBalance`) à chaque connexion. Attention à la migration des users existants — un `startBalance` global mal réglé peut écraser les soldes attendus.
- **`CREDS_KEY` / `CREDS_IV`** : présents dans le `.env`, à ne JAMAIS perdre ni régénérer lors d'une migration MongoDB. Ces clés chiffrent les credentials user en base ; sans elles, les données existantes deviennent illisibles.

---

# PARTIE 2 — Conventions techniques LibreChat

> Conventions techniques héritées de LibreChat, conservées telles quelles. Elles s'appliquent à tout le code du projet Vermeer.

## Project Overview

LibreChat is a monorepo with the following key workspaces:

| Workspace | Language | Side | Dependency | Purpose |
|---|---|---|---|---|
| `/api` | JS (legacy) | Backend | `packages/api`, `packages/data-schemas`, `packages/data-provider`, `@librechat/agents` | Express server — minimize changes here |
| `/packages/api` | **TypeScript** | Backend | `packages/data-schemas`, `packages/data-provider` | New backend code lives here (TS only, consumed by `/api`) |
| `/packages/data-schemas` | TypeScript | Backend | `packages/data-provider` | Database models/schemas, shareable across backend projects |
| `/packages/data-provider` | TypeScript | Shared | — | Shared API types, endpoints, data-service — used by both frontend and backend |
| `/client` | TypeScript/React | Frontend | `packages/data-provider`, `packages/client` | Frontend SPA |
| `/packages/client` | TypeScript | Frontend | `packages/data-provider` | Shared frontend utilities |

The source code for `@librechat/agents` (major backend dependency, same team) is at `/home/danny/agentus`.

---

## Workspace Boundaries

- **All new backend code must be TypeScript** in `/packages/api`.
- Keep `/api` changes to the absolute minimum (thin JS wrappers calling into `/packages/api`).
- Database-specific shared logic goes in `/packages/data-schemas`.
- Frontend/backend shared API logic (endpoints, types, data-service) goes in `/packages/data-provider`.
- Build data-provider from project root: `npm run build:data-provider`.

---

## Code Style

### Naming and File Organization

- **Single-word file names** whenever possible (e.g., `permissions.ts`, `capabilities.ts`, `service.ts`).
- When multiple words are needed, prefer grouping related modules under a **single-word directory** rather than using multi-word file names (e.g., `admin/capabilities.ts` not `adminCapabilities.ts`).
- The directory already provides context — `app/service.ts` not `app/appConfigService.ts`.

### Structure and Clarity

- **Never-nesting**: early returns, flat code, minimal indentation. Break complex operations into well-named helpers.
- **Functional first**: pure functions, immutable data, `map`/`filter`/`reduce` over imperative loops. Only reach for OOP when it clearly improves domain modeling or state encapsulation.
- **No dynamic imports** unless absolutely necessary.

### DRY

- Extract repeated logic into utility functions.
- Reusable hooks / higher-order components for UI patterns.
- Parameterized helpers instead of near-duplicate functions.
- Constants for repeated values; configuration objects over duplicated init code.
- Shared validators, centralized error handling, single source of truth for business rules.
- Shared typing system with interfaces/types extending common base definitions.
- Abstraction layers for external API interactions.

### Iteration and Performance

- **Minimize looping** — especially over shared data structures like message arrays, which are iterated frequently throughout the codebase. Every additional pass adds up at scale.
- Consolidate sequential O(n) operations into a single pass whenever possible; never loop over the same collection twice if the work can be combined.
- Choose data structures that reduce the need to iterate (e.g., `Map`/`Set` for lookups instead of `Array.find`/`Array.includes`).
- Avoid unnecessary object creation; consider space-time tradeoffs.
- Prevent memory leaks: careful with closures, dispose resources/event listeners, no circular references.

### Type Safety

- **Never use `any`**. Explicit types for all parameters, return values, and variables.
- **Limit `unknown`** — avoid `unknown`, `Record<string, unknown>`, and `as unknown as T` assertions. A `Record<string, unknown>` almost always signals a missing explicit type definition.
- **Don't duplicate types** — before defining a new type, check whether it already exists in the project (especially `packages/data-provider`). Reuse and extend existing types rather than creating redundant definitions.
- Use union types, generics, and interfaces appropriately.
- All TypeScript and ESLint warnings/errors must be addressed — do not leave unresolved diagnostics.

### Comments and Documentation

- Write self-documenting code; no inline comments narrating what code does.
- JSDoc only for complex/non-obvious logic or intellisense on public APIs.
- Single-line JSDoc for brief docs, multi-line for complex cases.
- Avoid standalone `//` comments unless absolutely necessary.

### Import Order

Imports are organized into three sections:

1. **Package imports** — sorted shortest to longest line length (`react` always first).
2. **`import type` imports** — sorted longest to shortest (package types first, then local types; length resets between sub-groups).
3. **Local/project imports** — sorted longest to shortest.

Multi-line imports count total character length across all lines. Consolidate value imports from the same module. Always use standalone `import type { ... }` — never inline `type` inside value imports.

### JS/TS Loop Preferences

- **Limit looping as much as possible.** Prefer single-pass transformations and avoid re-iterating the same data.
- `for (let i = 0; ...)` for performance-critical or index-dependent operations.
- `for...of` for simple array iteration.
- `for...in` only for object property enumeration.

---

## Frontend Rules (`client/src/**/*`)

### Localization

- All user-facing text must use `useLocalize()`.
- Only update English keys in `client/src/locales/en/translation.json` (other languages are automated externally).
- Semantic key prefixes: `com_ui_`, `com_assistants_`, etc.

### Components

- TypeScript for all React components with proper type imports.
- Semantic HTML with ARIA labels (`role`, `aria-label`) for accessibility.
- Group related components in feature directories (e.g., `SidePanel/Memories/`).
- Use index files for clean exports.

### Data Management

- Feature hooks: `client/src/data-provider/[Feature]/queries.ts` → `[Feature]/index.ts` → `client/src/data-provider/index.ts`.
- React Query (`@tanstack/react-query`) for all API interactions; proper query invalidation on mutations.
- QueryKeys and MutationKeys in `packages/data-provider/src/keys.ts`.

### Data-Provider Integration

- Endpoints: `packages/data-provider/src/api-endpoints.ts`
- Data service: `packages/data-provider/src/data-service.ts`
- Types: `packages/data-provider/src/types/queries.ts`
- Use `encodeURIComponent` for dynamic URL parameters.

### Performance

- Prioritize memory and speed efficiency at scale.
- Cursor pagination for large datasets.
- Proper dependency arrays to avoid unnecessary re-renders.
- Leverage React Query caching and background refetching.

---

## Development Commands

| Command | Purpose |
|---|---|
| `npm run smart-reinstall` | Install deps (if lockfile changed) + build via Turborepo |
| `npm run reinstall` | Clean install — wipe `node_modules` and reinstall from scratch |
| `npm run backend` | Start the backend server |
| `npm run backend:dev` | Start backend with file watching (development) |
| `npm run build` | Build all compiled code via Turborepo (parallel, cached) |
| `npm run frontend` | Build all compiled code sequentially (legacy fallback) |
| `npm run frontend:dev` | Start frontend dev server with HMR (port 3090, requires backend running) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes |

- Node.js: v20.19.0+ or ^22.12.0 or >= 23.0.0
- Database: MongoDB
- Backend runs on `http://localhost:3080/`; frontend dev server on `http://localhost:3090/`

---

## Testing

- Framework: **Jest**, run per-workspace.
- Run tests from their workspace directory: `cd api && npx jest <pattern>`, `cd packages/api && npx jest <pattern>`, etc.
- Frontend tests: `__tests__` directories alongside components; use `test/layout-test-utils` for rendering.
- Cover loading, success, and error states for UI/data flows.

### Philosophy

- **Real logic over mocks.** Exercise actual code paths with real dependencies. Mocking is a last resort.
- **Spies over mocks.** Assert that real functions are called with expected arguments and frequency without replacing underlying logic.
- **MongoDB**: use `mongodb-memory-server` for a real in-memory MongoDB instance. Test actual queries and schema validation, not mocked DB calls.
- **MCP**: use real `@modelcontextprotocol/sdk` exports for servers, transports, and tool definitions. Mirror real scenarios, don't stub SDK internals.
- Only mock what you cannot control: external HTTP APIs, rate-limited services, non-deterministic system calls.
- Heavy mocking is a code smell, not a testing strategy.

---

## Formatting

Fix all formatting lint errors (trailing spaces, tabs, newlines, indentation) using auto-fix when available. All TypeScript/ESLint warnings and errors **must** be resolved.
