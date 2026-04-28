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

## CodeCan Brand & Design System

This LibreChat fork ships as the **CodeCan AI** iOS chat (with a web build). The design medium is HTML/CSS/JS prototypes from claude.ai/design — pixel-recreate the visual output, don't copy the prototype's structure unless it fits. Source bundle when handed off lives at `/tmp/design2/codecan-ai/` (HTML+CSS+chat transcripts).

### Tokens (single source of truth)

CSS variables live in `client/src/style.css`:

**Light mode (the `:root` block):**
- `--brand-blue-500` `#0B2F5B` (navy / primary action color in light)
- `--brand-blue-800` `#07142E` (deep ink)
- `--paper-50/100/200/300` (`#FFFFFF`/`#F6F9FF`/`#EAF2FF`/`#D9E3F2`) — page/card surfaces
- `--slate-200/300/400/500` — muted text/borders
- `--signal-amber` `#F2B644` — citation rule, "View PDF" link in light, **primary action color in dark**
- `--signal-mint` `#6EFFC7` — status accent
- `--signal-flag` `#D63A3A` — error
- Display serif: Cormorant Garamond 500 (loaded via Google Fonts in `client/index.html`); used only for the empty-state hero

**Dark mode (the `.dark` block):**
- `--dm-ambient` `#0A1424` (page bg — deeper than navy)
- `--dm-surface` `#0F1E36` (cards, raised)
- `--dm-surface2` `#152846` (header, composer raised)
- `--dm-text` `#E5ECF7` (primary)
- `--dm-text-mute` `#8FA0BD` (secondary)
- `--dm-text-faint` `#5C6B85` (tertiary, eyebrow)

**The dark-mode design rule: amber replaces navy as the primary action color.** Navy is too close to the dark bg, so send button, edit button, "View PDF" link, "Get the section." display line all become amber in dark mode. Tile borders use `white/[0.06]`/`white/[0.14]`. The PDF page card stays light (paper-50) in both modes — reading 9pt serif on black is genuinely worse, and Apple Preview / Acrobat dark mode does the same.

Wired through Tailwind in `client/tailwind.config.cjs` as:
- `bg-ink-800` / `text-ink-700` etc.
- `bg-paper-100`, `bg-paper-200`
- `text-cc-slate-500` (NOT `text-slate-500` — Tailwind has its own slate scale we deliberately don't override)
- `bg-signal-amber`, `bg-signal-mint`, `bg-signal-flag`
- `bg-dm-ambient`, `bg-dm-surface`, `bg-dm-surface2`, `text-dm-text`, `text-dm-text-mute`, `text-dm-text-faint`
- `font-serif` → Cormorant Garamond, falls back to Georgia

Brand mark component: `import { CodeCanBrandIcon } from '@librechat/client'` (defined at `packages/client/src/svgs/CodeCanBrandIcon.tsx`). Always prefer this over the legacy logo `<img>`.

### Component touchpoints for the chat surfaces

| Surface | File | Notes |
| --- | --- | --- |
| Mobile chat header | `client/src/components/Nav/MobileNav.tsx` | Tinted hamburger tile (left), brand mark + title (center), navy edit tile (right). Edit tile becomes amber in dark mode. Header uses `pt-[max(env(safe-area-inset-top),0.5rem)]` so iPhone notch is respected. |
| Landing / empty state | `client/src/components/Chat/Landing.tsx` | 72px hero brand icon, Cormorant serif "Ask the Code. / Get the section." (the "Get the section." line is amber in dark mode), slate subhead. Anchored to top with `pt-12 sm:pt-16` — don't `justify-center` it. |
| Conversation starters | `client/src/components/Chat/Input/ConversationStarters.tsx` | Falls back to a hardcoded `CODECAN_DEFAULT_STARTERS` list when no agent starters are configured. Card style: amber 3px left rule, italic ink-800/dm-text title, navy/amber chevron. |
| AI message brand glyph | `client/src/components/Chat/Messages/MessageIcon.tsx` | Returns `<CodeCanBrandIcon size={28} radius={6} />` for assistant messages without a custom avatar. **The brand-icon branch must come BEFORE the `iconURL.includes('http')` ConvoIconURL branch** — otherwise during streaming the `ConvoIconURL → URLIcon` path renders a `rounded-full` wrapper that looks like an empty circle while the image loads. |
| Citations card | `client/src/components/Chat/Messages/CitationsBlock.tsx` | Single-line rows: `[amber rule] | source title (truncates) | p. 741 | View PDF ↗`. View PDF is navy in light, amber in dark. Backed by `client/src/data/pdfs.json`. |
| Action tiles | `client/src/components/Chat/Messages/HoverButtons.tsx`, `Feedback.tsx`, `Fork.tsx` | All three share the same `inline-flex h-[38px] w-[38px] rounded-[10px] bg-[rgba(11,47,91,0.05)]` (light) / `dark:bg-white/[0.06]` (dark) tile style. **If you add a new message-action button, mirror this style** so the row stays uniform. |
| Composer pill | `client/src/components/Chat/Input/ChatForm.tsx` | Single row: textarea + mic + send all `items-center gap-1.5`. Textarea uses `<TextareaAutosize minRows={1} maxRows={8} rows={1}>` — do **not** pass `style.minHeight` (the lib throws). The badge row is rendered separately below the pill so it auto-collapses when no badges are active. |
| Send button | `client/src/components/Chat/Input/SendButton.tsx` | Navy circle in light, amber circle in dark. **You must explicitly pass `text-white dark:text-dm-ambient` to `SendIcon`** — `SendIcon` ships with a hardcoded `dark:text-black` that must be overridden at the call site. |
| Composer dock | `client/src/components/Chat/ChatView.tsx` | The wrapper around `<ChatForm>`. Uses `bg-gradient-to-t from-white dark:from-dm-ambient` so the pill floats over the chat scroll without a visible band. |
| PDF viewer | `client/src/components/Pdf/PdfViewer.tsx` | Navy header (`dark:bg-dm-surface2`), paper canvas (`dark:bg-dm-ambient`), white page card that **stays light in dark mode**. Page width auto-fits via `ResizeObserver` + react-pdf's `width` prop (do not use `scale={1}` directly — the PDF will horizontally crop on mobile). |
| Placeholder text | `client/src/hooks/Input/useTextarea.ts` | Returns the literal `'Ask CodeCan'`. The hook **overrides** the JSX `placeholder` prop via `setAttribute` after mount, so changing the placeholder in `ChatForm.tsx` alone does nothing. |

### Surface-token mapping (don't skip)

`--presentation` controls the chat panel wrapper bg via `SidePanelGroup`'s `bg-presentation`. `--surface-chat` and `--surface-primary*` control inner chat surfaces. In dark mode, all of these are remapped to the `--dm-*` tokens — if the body looks gray in dark mode you almost certainly forgot to update one of these. The hardcoded `.dark body, .dark html { background-color: rgba(33, 33, 33, ...) }` rules at the bottom of `style.css` (around lines 1535/1801) also must point at `var(--dm-ambient)`.

### Gotchas hit during the redesign (don't waste time rediscovering)

- **`.hover-button { display: block }` in `client/src/mobile.css` overrides Tailwind `inline-flex`** at viewports ≤767px. If action-tile icons render left-aligned within their tile (svgX=0 instead of svgX=10 in a 38px tile), this rule is the cause. Same applies to `.hover-button.active`. Both lines have been deleted; don't reintroduce them.
- **`TextareaAutosize` from `react-textarea-autosize` throws** on `style.minHeight`/`style.maxHeight`. Use the `minRows`/`maxRows` props instead.
- **The chat body is 28×28 wrapped in `h-7 w-7`** in `MessageRender.tsx`. Earlier code used `h-6 w-6 rounded-full` which clipped the brand icon to a 24px circle — confirm the wrapper is square (`h-7 w-7` with `overflow-hidden` only, no `rounded-full`).
- **Worktree TypeScript resolution**: this repo's `@librechat/client` is symlinked from `node_modules/@librechat/client` to `packages/client/dist`. Running `npm run build` inside `packages/client` of the **worktree** writes to `worktrees/.../packages/client/dist` but the TS path resolver follows the symlink to `/Users/cnoble/Apps/LibreChat/packages/client/dist`. After building in the worktree, sync with `cp -R packages/client/dist/. /Users/cnoble/Apps/LibreChat/packages/client/dist/` so worktree typecheck sees new exports. Also symlink `node_modules` → main repo's `node_modules` if it doesn't exist.
- **Vite port collision**: another local project (CodeCanWebsite) runs on `5173`. The launch.json pins this app to `5179` with `--strictPort`. Don't change it back to 5173 unless you check `lsof -i :5173` is empty.
- **Tailwind opacity arbitrary values**: `dark:bg-white/8` doesn't always compile. Prefer `dark:bg-white/[0.08]` for atypical opacities.

## Running the frontend in your own browser

The harness exposes the running Vite dev server through `mcp__Claude_Preview__*` tools — use these instead of "Claude in Chrome" or piping screenshots through Bash. The launch config is committed at `.claude/launch.json`.

### Start a session

1. Call `preview_start` with `name: "frontend"`. The runtime fires `npm exec vite --port 5179 --strictPort` inside `client/`. Returns a `serverId` and a port.
2. Vite emits `Re-optimizing dependencies because vite config has changed` on first launch; the `VITE ready in ...ms` log is the readiness signal. Use `Bash run_in_background` with an `until curl -sf http://localhost:5179/ -o /dev/null` loop to wait — don't poll preview_logs.
3. **The preview tracking is fragile**: each `preview_start` returns a new `serverId`, but if you call `preview_logs` then immediately call `preview_screenshot` you may hit "Server not found" because the harness lost the registration even though the underlying Vite process is fine. If that happens, call `preview_start` again — same Vite process gets re-attached with a fresh ID. Do **not** kill the Vite process; just re-attach.

### Authenticated dev login

There's a seeded test user — **`bob@bob.com` / `safecopy`** — that lets you reach the chat. Steps:

```
preview_fill input[name='email'] bob@bob.com
preview_fill input[name='password'] safecopy
preview_click button[type='submit']
```

Wait for `window.location.pathname` to leave `/login` (a poll loop in `preview_eval` works fine). The authenticated chat is at `/c/new`.

### Forcing light vs dark mode

Theme is stored in `localStorage` as JSON-quoted (note the extra quotes). To toggle from a `preview_eval`:

```js
localStorage.setItem('color-theme', '"dark"');  // or '"light"'
document.documentElement.classList.toggle('dark', true);
window.location.reload();
```

`preview_resize` accepts a `colorScheme: 'dark' | 'light'` for the `prefers-color-scheme` media feature, but LibreChat reads from `localStorage`, so **set both**.

### Verifying visual changes (not just screenshots)

- `preview_inspect '<selector>'` returns computed styles — best for verifying colors, padding, font-family. Use `['background-color', 'color', 'font-family']` for the `styles` array. Faster and more reliable than screenshot diffs.
- `preview_eval` to read DOM state. To check icon centering inside a tile, get both `getBoundingClientRect()`s and compute the offset — if `svgX !== (tileW - svgW) / 2`, the icon isn't flex-centered.
- `preview_screenshot` for layout sanity checks. The viewport runs at devicePixelRatio 2, so the returned image is 2× the configured viewport size.
- `preview_console_logs level: 'error'` to surface React errors. Useful when the textarea props change throws.
- React Query Devtools renders a flower icon at top-right in dev — that's not part of the app chrome. Production builds don't include it.

### When NOT to use preview tools

- For pure unit tests, run `npx jest path/to/spec` directly. The worktree may need `node_modules` symlinked from main first (`ln -sfn /Users/cnoble/Apps/LibreChat/node_modules node_modules && ln -sfn /Users/cnoble/Apps/LibreChat/client/node_modules client/node_modules`).
- For typechecking, `cd client && npx tsc --noEmit`. Pre-existing errors live in `conversationTags.spec.ts`, `imageResize.ts`, e2e configs, and `HeaderOptions.tsx`'s `PluginStoreDialog` import — those aren't yours to fix unless your change touches them.
