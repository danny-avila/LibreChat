# Repository Guidelines

## Project Structure & Module Organization
- `client/` hosts the Vite/React frontend (`src/` for components/hooks, `public/` for static assets, `test/` for UI specs).
- `api/` contains the Node/Express backend, with business logic inside `server/`, database models in `models/`, and Jest specs under matching `*.spec.js` files.
- `packages/` bundles shared libraries (`@librechat/api`, `data-provider`, `data-schemas`) consumed by both client and server.
- `config/`, `librechat.yaml`, and `.env` govern runtime configuration; `docker-compose*.yml` orchestrates optional container dependencies.

## Build, Test, and Development Commands
- `npm install` — installs workspace dependencies and prepares symlinked packages.
- `npm run build:packages` — compiles the shared `packages/*` libraries (run after editing them).
- `npm run backend:dev` — starts the API with nodemon; expects Mongo/Meili endpoints from `.env`.
- `npm run frontend:dev` — launches the Vite dev server at `http://localhost:5173`.
- `npm run test:api` / `npm run test:client` — run the full Jest suites for the backend and frontend respectively.

## Coding Style & Naming Conventions
- TypeScript/JavaScript files use 2-space indentation and ES module syntax on the client, CommonJS on the backend unless otherwise required.
- Components are PascalCase (`ChatView.tsx`), hooks are camelCase prefixed with `use` (`useNewConvo.ts`), and specs mirror source names with `.spec.tsx|.spec.js`.
- Linting relies on the repo’s ESLint/Prettier config (`npm run lint`), while Tailwind utility classes drive most styling; avoid ad-hoc inline styles unless necessary.

## Testing Guidelines
- Backend uses Jest + mongodb-memory-server; place specs beside their targets (e.g., `models/Conversation.spec.js`).
- Frontend tests live in `client/src/**/__tests__` or next to components using React Testing Library.
- Keep tests deterministic (mock network dependencies), and run targeted suites with `npx jest path/to/spec`.

## Commit & Pull Request Guidelines
- Follow conventional, descriptive commit subjects (e.g., `fix: restore left nav toggle visibility`), grouping related changes.
- Pull requests should describe the problem, summarize changes, list testing steps/commands, and attach screenshots or logs when UI or config changes are involved.
- Link relevant issues using `Fixes #123` and ensure CI build/test commands pass before requesting review.

## Persistent Codex Context
- Always read `docs/codex/CODECAN_DIRECT_CONTEXT.md` at the start of a session to load CodeCanDirect decisions, fixes, and constraints.
