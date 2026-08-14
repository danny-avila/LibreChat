# Plan: Re-skin `client/src` with the Cosmic-DS Figma Design System — Revised

> **Scope note for reviewers:** This plan is **unrelated to the Clerk auth work** happening elsewhere on the `clerk-auth-2026-08-13-05-31` branch/worktree in this session. It does not touch any auth code, and no UI code has been changed to produce it — this document and its companion research are the only output. If you're reviewing Clerk-auth changes, skip this file.

- **Status:** Draft plan, revised after review — research complete, all open questions resolved, no implementation started
- **Updated:** 2026-08-13 (revision incorporating review findings + explicit stakeholder decisions)
- **Tracking:** Beads issue `AF-7wip`
- **Author context:** Written 2026-08-13 by an agent, working session on the `clerk-auth-2026-08-13-05-31` worktree (branch unrelated to this plan's subject)
- **Review incorporated:** `thoughts/searchable/shared/plans/2026-08-13-08-59-cosmic-ds-frontend-reskin-plan-REVIEW.md`
- **Figma source:** [Cosmic-DS](https://www.figma.com/design/eZxbwdGbKOm594wqBBfS69/Cosmic-DS?node-id=3-12) (fileKey `eZxbwdGbKOm594wqBBfS69`)
- **Target codebase area:** `client/src/**` and its dependency `packages/client/src/**` (the `@librechat/client` shared component package that `client/tailwind.config.cjs` also compiles)

---

## Decisions & Corrections Locked by This Revision

These are resolved, not optional refinements. Every open question from the original draft is closed here; several were re-verified independently during this revision (grep counts re-run 2026-08-13), and one review finding was itself corrected after further investigation.

1. **Cosmic-DS/Figma licensing is not a blocker.** A commercial Cosmic-DS/Figma license is already held. The original draft's Open Question §5.1 (Satoshi font licensing, framed by analogy to this repo's blocked Söhne swap) is resolved: proceed with Satoshi as `fontFamily.sans` in Phase 1 — no separate licensing gate before Phase 1 begins.
2. **The shadcn "test styles" token block is NOT dead code — do not delete it outright.** Re-verified directly against the current tree (not just accepted from the review): `bg-background` (16), `text-muted-foreground` (15), `bg-accent` (13), `bg-primary` (9), `bg-destructive` (9), `bg-muted` (5), `text-foreground` (4), `border-input` (4), `bg-secondary` (2), `bg-switch-unchecked` (1) — all real, live usages across `client/src`/`packages/client/src`. Only `bg-card`/`text-card-foreground` returned **zero** usages and are the sole safe-to-delete-immediately pair. Resolution: Phase 1 gets an explicit migration sub-step (below) that maps the ~60 live usages onto Cosmic-DS semantic tokens before the block (`client/tailwind.config.cjs:135-165`) is removed. This supersedes the original plan's Open Question §5.2 recommendation to "delete outright."
3. **"Temporary chat" mode color maps to `color/brand/subtle`.** `ChatForm.tsx:549-550`'s hardcoded `border-violet-800/60 bg-violet-950/10` maps to Cosmic-DS's `color/brand/subtle` token — already confirmed to exist in the `02 · Semantic / Color` collection (§3.1: `color/brand/primary|accent|subtle|pale`). No new Figma query or new semantic token needed. Resolves Open Question §5.3.
4. **Radius/shadow/motion/z-index scales stay static.** They are plain CSS vars / Tailwind theme values, not wired into `IThemeRGB`/`applyTheme`. No runtime-overridability requirement. Resolves Open Question §5.4 as the original plan's own recommendation — now locked, not provisional.
5. **Token count correction: 49, not "~40."** `applyTheme.ts`'s `mappings` array (`packages/client/src/theme/utils/applyTheme.ts:29-79`) covers 49 token names, confirmed by direct read. Every "~40" reference below is corrected to 49.
6. **The load-bearing name-stability set (§2.3/§4.6) is missing two names.** `client/tailwind.config.cjs:107,134` map `text-destructive`/`border-destructive` to real CSS vars in `style.css` that do **not** appear in `IThemeRGB`/`IThemeVariables`/`mapTheme()` — they're real, Tailwind-consumed names outside `ThemeProvider`'s runtime-override surface (consistent with Decision 4: they're just not currently wired for override, same as the new structural scales), but their **names** are still load-bearing and must not be renamed under this plan's "values change, names don't" contract. Added to the protected-name list.
7. **A second, live Tailwind config was missing from scope — now added.** `packages/client/tailwind.config.js` exists (confirmed) and feeds `@librechat/client`'s own published `dist/style.css` build via `packages/client/src/theme/utils/createTailwindColors.js`, which today only maps `colors` — no `borderRadius`/`boxShadow`/`transitionDuration`/z-index extension. Phase 1 gets an explicit item to update this config (or unify both configs behind one shared `theme.extend` source) alongside `client/tailwind.config.cjs`.
8. **`Dialog.tsx`'s real blast radius is larger than the review found, but the fix is smaller than a full migration.** The review named 5 files across 3 "direct import sites." Direct verification (`grep -rl "DialogTemplate" client/src packages/client/src`, re-run 2026-08-13) found **`packages/client/src/components/DialogTemplate.tsx` hard-imports `DialogClose/DialogContent/DialogDescription/DialogFooter/DialogHeader/DialogTitle` from `./Dialog` at module scope** (`DialogTemplate.tsx:2-9`) — meaning deleting `Dialog.tsx` breaks `DialogTemplate.tsx` itself and, transitively, **all 35 files** that import `DialogTemplate` (not just the 3 the review named: `TermsAndConditionsModal.tsx`, `ContextButton.tsx`, `PresetItems.tsx`, plus 32 more — full list captured in Phase 2 below), on top of the 2 direct external consumers (`DangerButton.tsx`, `UploadFileModal.tsx`).
   However: `OriginalDialog.tsx` already exports structurally-identical primitives under an `OG`-prefix (`OriginalDialog.tsx:241-251`: `OGDialogClose`, `OGDialogContent`, `OGDialogDescription`, `OGDialogFooter`, `OGDialogHeader`, `OGDialogTitle`). So the actual fix is **not** a 35-file migration — it's a **one-file repoint** of `DialogTemplate.tsx`'s internal import from `./Dialog` to `./OriginalDialog` (swapping to the `OG`-prefixed names), which clears all 35 downstream consumers in one edit, **plus** migrating the 2 remaining direct consumers (`DangerButton.tsx`, `UploadFileModal.tsx`) individually. Phase 2 is rewritten below to reflect this, replacing the review's less-accurate 5-file estimate.
9. **`get_design_context` per component is now a blocking Phase 2 precondition**, not a background verification task — Button/Input/Badge/Avatar/card code changes may not start until each component's real Cosmic-DS variant/prop contract has been pulled (only Progress Bar was pulled in full during research).
10. **Visual-verification tooling gets an explicit decision gate, not silent reliance on manual QA.** The repo has no Storybook, no visual-regression tooling, and no unit tests on any of the six targeted primitives; the one accidental safety net (axe a11y contrast checks) is disabled on this fork's CI. Before Phase 1 lands, explicitly choose one: (a) accept manual-QA-only risk for this migration, or (b) add minimal verification first — cheapest options, in order of leverage: Playwright `toHaveScreenshot()` baselines (infrastructure already fully built in this repo — incremental, not new) or RTL tests asserting resolved `className`/CSS-variable values (modeled on the existing `ThemeSelector.spec.tsx`). This decision is now a named Phase 1 item, not an implicit gap.
11. **Each phase needs its own `create_tdd_plan` companion document** with real Given/When/Then behaviors before implementation begins. This document remains the Phase-0 research/architecture input to that process, not a substitute for it — consistent with its own §7 ("Any actual code change... is the full deliverable of this task" refers to *this document*, not the eventual re-skin implementation).

---

## 1. Summary

silmari-chat's frontend currently themes itself through a hand-rolled CSS-custom-property system (`client/src/style.css`) consumed by Tailwind (`client/tailwind.config.cjs`) and a runtime `ThemeProvider` (`packages/client/src/theme/`). It works, but it has accumulated **two competing, partially-overlapping token systems** in the same file, several components with hardcoded colors that bypass both, and no formal scale for radius, shadow, motion, or z-index.

Cosmic-DS is a real, actively-maintained Figma library (last component update 2026-06-27) with exactly the kind of layered token architecture (primitives → semantic → dark-mode overrides, plus dedicated motion/z-index/radius/shadow primitive collections) that the current system is missing, and a component roster that covers most of what a chat UI needs (Button, Input, Avatar, Badge, Card, Progress Bar, Spinner, Modal/Popover, Menu, Segmented Control, Pagination, Breadcrumbs, Table cells).

The plan below: (a) documents the current system precisely enough to know what's being replaced, (b) documents what Cosmic-DS actually contains (verified via the Figma MCP, not assumed), (c) proposes keeping the *existing* CSS-variable **names** as the stable public interface (since `ThemeProvider`/`applyTheme`/`IThemeRGB` already depend on them and downstream env-var theme overrides key off them) while replacing their **values** with Cosmic-DS's, and (d) sequences the work token-foundation-first, then shared primitives, then chat-critical surfaces, with everything else deferred.

---

## 2. Current-State Analysis

### 2.1 Two parallel color-token systems in one Tailwind config

`client/tailwind.config.cjs` defines colors in `theme.extend.colors` (`client/tailwind.config.cjs:72-166`) as **two separate, overlapping sets**:

1. **LibreChat's own semantic set** (`:73-134`) — hardcoded hex scales (`gray.20`–`900`, `green.50`–`900`) plus CSS-var passthroughs in the form `'token-name': 'var(--token-name)'`: `brand-purple`, `text-primary/secondary/secondary-alt/tertiary/warning/destructive`, `ring-primary`, `header-primary/hover/button-hover`, `surface-active/active-alt/hover/hover-alt/primary/primary-alt/primary-contrast/secondary/secondary-alt/tertiary/tertiary-alt/dialog/submit/submit-hover/destructive/destructive-hover/chat`, `border-light/medium/medium-alt/heavy/xheavy/destructive`.
2. **A shadcn/ui-style set explicitly commented `/* These are test styles */`** (`client/tailwind.config.cjs:135-165`) using `hsl(var(--x))`: `border`, `input`, `switch-unchecked`, `ring`, `background`, `foreground`, `primary`, `secondary`, `destructive`, `muted`, `accent`, `card` (each with a `-foreground` pair where relevant).

Both sets are backed by real `:root`/`.dark` CSS variables in `client/src/style.css` (`:136-198` light, `:199-259` dark, plus the shadcn HSL set re-declared at `:172-197` and `:236-258`). A **third**, narrower `.gizmo`/`.gizmo.dark` scope exists at `client/src/style.css:260-283` for a specific surface.

`theme.extend.borderRadius` (`client/tailwind.config.cjs:167-171`) derives `lg`/`md`/`sm` from a single `--radius` variable — there is no radius scale beyond that, and **no `boxShadow` or `fontSize` extension exists at all** (Tailwind defaults apply).

### 2.2 Fonts

`fontFamily` is set at the top level of the Tailwind config (`client/tailwind.config.cjs:13-16`), not inside `extend`, so it fully replaces Tailwind's defaults: `sans: ['Inter', 'sans-serif']`, `mono: ['Roboto Mono', 'monospace']`. `@font-face` declarations live at `client/src/style.css:383-459`. A commented-out alternate config for a paid "Söhne"/"Söhne Mono" family exists (`:17-20` in the config, `:461-559` in `style.css`), blocked on licensing — **precedent exists in this repo for a font swap being blocked on licensing**, which matters for Cosmic-DS's UI font (see §5, resolved by Decision 1 — a commercial license is already held).

### 2.3 Runtime theming mechanism

The theme system does not live under `client/src/hooks` or `client/src/Providers` — it lives in the shared package, imported as `@librechat/client`:

- `packages/client/src/theme/context/ThemeProvider.tsx` — holds `theme`/`themeRGB`/`themeName` state seeded from `localStorage` (`color-theme`, `theme-colors`, `theme-name`), toggles `.dark`/`.light` on `document.documentElement.classList` (`:195-201`) — this is what `darkMode: ['class']` and `.dark` in `style.css` key off. A `matchMedia('(prefers-color-scheme: dark)')` listener handles `theme === 'system'` (`:47-52`, `:209-219`).
- `packages/client/src/theme/utils/applyTheme.ts` — `mapTheme()`/`applyTheme()` write **inline styles** (`root.style.setProperty('--x', 'rgb(...)')`) for 49 tokens, overriding the cascaded `style.css` values at runtime. This is how per-deployment or per-user custom color themes work today.
- `packages/client/src/theme/types/index.ts` defines three parallel interfaces (`IThemeRGB` keyed `rgb-x`, `IThemeVariables` keyed `--x`, `IThemeColors` keyed `x`) mirroring the same 49 token names.
- `packages/client/src/theme/themes/default.ts` / `dark.ts` hold the predefined RGB values.
- `client/src/App.jsx:55-78` mounts `ThemeProvider`, optionally seeding `themeRGB` from `REACT_APP_THEME_*` env vars via `client/src/utils/getThemeFromEnv.js`.
- Full three-layer model (CSS vars → ThemeProvider → Tailwind classes) is documented in `packages/client/src/theme/README.md`, including the requirement that values stay **space-separated RGB triplets** (not `rgb(...)`) so Tailwind's opacity modifiers (`bg-surface-primary/50`) work.

**This is the load-bearing constraint for the whole plan**: the 49 tokens `ThemeProvider` knows how to override by name are fixed by `IThemeRGB`. Renaming them means touching this runtime override system, `default.ts`/`dark.ts`, the README, and any deployment already using `REACT_APP_THEME_*`. Keeping the names and swapping only the values avoids that blast radius entirely.

### 2.4 Where the actual component library lives

`client/src/components/ui/` (the directory a naive guess would target) is **nearly empty** — 3 files, mostly re-exports: `client/src/components/ui/index.ts:1` is literally `export { Button } from '@librechat/client';`. The real base component library is **`packages/client/src/components/`** (233 files, package `@librechat/client`), which `client/tailwind.config.cjs:8` scans directly alongside `client/src`.

Representative components and their current styling approach:

| Component | File | Approach | Notes |
|---|---|---|---|
| Button | `packages/client/src/components/Button.tsx` | `class-variance-authority` (`cva`), variants `default/link/submit/outline/destructive/secondary/ghost` × sizes, `:7-53` | Uses semantic tokens; Radix `Slot` for `asChild` (`:2,65`) |
| Input | `packages/client/src/components/Input.tsx` | Static class string via `cn()`, `:11-14` | `border-border-light`, `text-text-primary`, `focus-visible:ring-ring-primary` |
| Badge | `packages/client/src/components/Badge.tsx` | Inline `cn()` composition, `:70-81` | Mixes semantic tokens with a `@container` query variant; `framer-motion` + `lucide-react` |
| Avatar | `packages/client/src/components/Avatar.tsx` | Mixed Tailwind classes + **inline `style={{}}`**, `:52-57,74,80-84` | Hardcoded `backgroundColor: 'rgb(121, 137, 255)'` at `:54` — bypasses tokens entirely |
| Dialog (legacy) | `packages/client/src/components/Dialog.tsx` | Hardcoded gray-scale Tailwind utilities, `:63-64,121,152,173` | `bg-white`, `dark:bg-gray-700`, not semantic tokens |
| Dialog (current) | `packages/client/src/components/OriginalDialog.tsx` (exported `OGDialog*`) | Semantic tokens, `:173,180,235` | `bg-background`, `text-text-primary`, `ring-ring-primary` — this is the one feature code actually imports (e.g. `client/src/components/ui/AdminSettingsDialog.tsx:6-14`) |

Shared utility: `cn()` = `clsx` + `tailwind-merge`, `packages/client/src/utils/utils.ts:5-7`.

Two Dialog implementations coexisting (one dead-ish/hardcoded, one live/token-based) is a pre-existing cleanup opportunity this migration should resolve, not just re-skin around.

### 2.5 Chat-critical surfaces

| Surface | File(s) | Current state |
|---|---|---|
| Chat shell | `client/src/components/Chat/ChatView.tsx` (161 lines) | Layout classes only, no hardcoded colors |
| Message list | `client/src/components/Chat/Messages/MessagesView.tsx` (185 lines) | Tailwind utilities only |
| Message bubble | `client/src/components/Chat/Messages/Message.tsx` (46 lines) → `.../ui/MessageRender.tsx` (254 lines) | `Message.tsx:16` uses legacy hand-written class `text-token-text-primary` (`style.css:285-288`, not a generated Tailwind utility); `MessageRender.tsx:149-157` hardcodes width breakpoints (`md:max-w-[47rem] xl:max-w-[55rem]`); focus ring uses semantic token `focus-visible:ring-border-xheavy` (`:165`) |
| Composer | `client/src/components/Chat/Input/ChatForm.tsx` (800 lines) — note: there is **no** `client/src/components/Input/` dir, composer lives under `Chat/Input/` | `:465` hardcodes `placeholder-black/60 dark:placeholder-white/60` and `shadow-[0_2px_6px_rgba(0,0,0,.05)]`; `:549-551` — the "temporary chat" variant hardcodes `border-violet-800/60 bg-violet-950/10` while the normal-mode branch right next to it correctly uses `border-border-light bg-surface-chat` |
| Sidebar | `client/src/components/UnifiedSidebar/UnifiedSidebar.tsx` (207) + `Sidebar.tsx` (66) + `client/src/components/SidePanel/SidePanelGroup.tsx` (57) | Mostly token-driven already (`bg-surface-primary-alt`, `hover:bg-border-medium`, `bg-presentation`) — should re-skin close to "for free" once token values change |

Other hardcoded-value tech debt found in `style.css`, worth sweeping in this migration since it directly explains why some UI won't re-skin just from a token-value change: `.btn-primary` (`:1434-1468`, hardcoded green `rgba(16,163,127,...)`), `.premium-scroll-button` (`:770-798`, hardcoded `#ffffff`/`#2a2a2e`), `.creative-tab`/`.fast-tab`/`.balanced-tab`/`.precise-tab` (`:658-673`, hardcoded gradients — functionally a segmented control, see §4), `.shimmer`/`.dark .shimmer` (`:2982-3010`), `.gemini-gradient` (`mobile.css:125-132`), `.azure-bg-color` (`mobile.css:235-237`).

### 2.6 Relevant dependencies (`client/package.json`)

`tailwindcss@^3.4.1`, `tailwind-merge@^1.9.1`, `class-variance-authority@^0.7.1`, `clsx@^2.1.1`, `tailwindcss-animate@^1.0.5`, `tailwindcss-radix@^2.8.0`, `framer-motion@^12.40.0`, `lucide-react@^0.394.0`, a full set of `@radix-ui/react-*` primitives, `@headlessui/react`, `@ariakit/react`. `@tailwindcss/typography` is installed but commented out — `.prose` styles are hand-copied into `style.css` instead (`:851-1258`).

### 2.7 Pre-existing design-system documentation

None. A repo-wide case-insensitive grep for `"design system"`, `"design token"`, and `"cosmic"` across `client/src` and `thoughts/` returned zero matches. The only relevant existing doc is `packages/client/src/theme/README.md`, which documents the CSS-variable/ThemeProvider mechanism but not any named design system.

---

## 3. Cosmic-DS: What's Actually In The Figma File

Verified via the Figma MCP (`get_metadata`, `get_design_context`, `get_variable_defs`, `search_design_system`) against fileKey `eZxbwdGbKOm594wqBBfS69`. Auth worked without any interactive-login blocker (`whoami` → `maceo@cosmicinc.ai`, "Cosmic Team" plan, Full seat, pro tier).

**Caveat on completeness:** `get_metadata` with no `nodeId` (list top-level pages) only reliably returned the `Cover` page — this looks like a quirk of how this MCP session traverses the file rather than the file actually having one page (the node-id given in the task, `3:12`, is itself a second canvas/page named "▬ Progress Bars", proving more pages exist). `search_design_system` was used instead to enumerate published library assets, which is reliable but query-driven — it will not surface something no query happened to match. Treat the roster below as **strong evidence of what exists**, not a guaranteed-exhaustive inventory. **Code Connect is not accessible on this plan/seat** (`get_code_connect_map` returned: "You need a Dev or Full seat on an Organization or Enterprise plan" — despite the "Full seat" name, it's gated to Org/Enterprise plans), so there are no machine-readable Figma→code mappings to consume; component contracts must be extracted manually per-component during implementation via `get_design_context`.

### 3.1 Token architecture

Cosmic-DS uses **numbered, layered variable collections** — a primitives → semantic → dark-mode-override structure, plus dedicated motion/z-index collections the current codebase has no equivalent of:

| Collection | Contents observed |
|---|---|
| `02 · Semantic / Color` | `color/text/primary\|secondary\|tertiary\|disabled\|placeholder\|inverse\|on-color\|link`, `color/border/focus\|error\|subtle`, `color/surface/sunken`, `color/brand/primary\|accent\|subtle\|pale`, `color/interactive/primary/bg\|subtle`, `color/interactive/secondary/text`, `color/interactive/danger/subtle`, `color/semantic/{error,warning,info}/*` |
| `04 · Primitives / Radius` | `radius/none\|xs\|sm\|md\|lg\|xl\|2xl\|3xl\|4xl\|full` (full = 999px) |
| `05 · Dark Mode / Surfaces` | Dark-mode overrides mirroring the semantic set: `dm/text/primary\|secondary\|tertiary\|disabled\|placeholder`, `dm/border/default\|subtle\|strong` |
| `07 · Primitives / Motion` | `easing/in-out`, `duration/normal` ("Standard — hover, tooltip, dropdown"), `duration/slow` ("Content transitions — panel, modal enter") |
| `08 · Primitives / Z-index` | `z/sticky`, `z/dropdown`, `z/tooltip`, `z/modal`, `z/toast` (each with a usage description) |

Collections `01`, `03`, and `06` were not directly observed (likely Primitives/Color, Primitives/Spacing, and a typography-primitives collection respectively, based on the numbering gaps and on `space/2xs`/`space/sm` and `neutral/0`/`neutral/850` values seen embedded in component-level token usage) — confirming their exact contents is Phase 1 follow-up work, not blocking for this plan.

Effect styles (shadows): `shadow/xs\|sm\|md\|lg\|xl\|inner`, plus `blur/lg` ("Modal/overlay backdrop"). Text styles seen: `Body/XS · Medium` (Satoshi, Medium, 12px/18px), `Label/XS` (Satoshi, Medium, 11px/14px, 0.25px tracking), `Code/MD` and `Code/SM` (**Roboto Mono** — "Primary code and technical text... command strings, environment variables, technical output from agents").

**Brand palette** (from real hex values pulled off the Progress Bar component): primary `#4f3ed6` (deep indigo-violet), accent `#8470ff` (lighter violet), plus semantic `error #ef4444`/`#b91c1c`, `warning #e8900a`, neutrals `#ffffff`/`#2c2c50`/`#f0f0f5`/`#54546a`. This is a cohesive violet/indigo identity, not a generic palette.

**Typography**: UI text in **Satoshi** (not currently used anywhere in this repo — same category of risk as the repo's existing blocked Söhne swap, but resolved: see §5, Decision 1 — a commercial Cosmic-DS/Figma license is already held). Code/technical text in **Roboto Mono** — this **already matches** the current codebase's `fontFamily.mono`, so the code-font migration is a no-op.

### 3.2 Component roster (confirmed to exist as published `component_set`/`component` assets)

Button, Button-Icon, Radio Button, Input, `👤 Avatar`, Badge/Dot, Badge/Count, card, Progress Bar (verified in full detail — 6 states × 2 layouts, see below), Spinner, modal-popover, `menu container`, segmented-control, pagination, breadcrumbs, media, `subcomponents/table/col`, `subcomponents/table/header-cell`, `🎨 Color Palette` (documentation component). A separate linked "Phosphor Icons (Community)" library provides the icon set (not part of Cosmic-DS itself).

**Progress Bar** was pulled in full via `get_design_context` on node `15:113` as a worked example of the reference-code shape every other component will need: a single component takes `layout: "block" | "flex"` and `state: "empty" | "in-progress" | "complete" | "error" | "warning" | "indeterminate"` props, and every visual value in its reference implementation resolves to a Cosmic-DS variable (e.g. `bg-[var(--color/interactive/primary/bg,#4f3ed6)]`, `rounded-[var(--radius/full,999px)]`) — confirming tokens, not hardcoded values, drive the whole system end to end, which is exactly the property the current codebase is missing in several places (§2.5).

Only Progress Bar's node ID was resolved in this pass (Button/Input/Avatar/etc. were found via `search_design_system`, which returns a `componentKey`, not a local `nodeId` usable with `get_design_context`) — pulling exact prop contracts for every other component is explicitly deferred to the phase that implements it (§6).

---

## 4. Desired End State

1. **One token system, not two.** `client/src/style.css` and `client/tailwind.config.cjs` expose a single, coherent set of CSS variables sourced from Cosmic-DS's semantic layer, under the **existing** LibreChat variable names (`--text-primary`, `--surface-primary`, `--border-light`, etc. — see §2.3 for why names stay fixed). The shadcn "test styles" block's ~60 live usages are migrated onto Cosmic-DS semantic tokens (Decision 2) so the block can be retired as a genuinely dead second system, not left half-used.
2. **Formal scales exist** for radius, shadow/elevation, motion (duration + easing), and z-index — currently ad hoc or absent — sourced from Cosmic-DS's primitive collections and exposed as new CSS variables + Tailwind theme extensions.
3. **Cosmic-DS's brand identity is visible**: the violet/indigo primary/accent palette, Satoshi for UI text (Roboto Mono for code is already correct), and Cosmic-DS's radius/shadow scale replace the current mixed gray/green LibreChat palette and single-radius system.
4. **Shared primitives in `packages/client/src/components/`** (Button, Input, Badge, Avatar, Dialog) draw every visual value from the new token set — no hardcoded hex/rgb (fixes Avatar's `rgb(121,137,255)`, consolidates the two Dialog implementations onto one).
5. **Chat-critical surfaces** (composer, message bubble, sidebar) are free of the one-off hardcoded values cataloged in §2.5.
6. **No change** to the `ThemeProvider` public contract, `REACT_APP_THEME_*` override mechanism, or any Tailwind class name consumers already depend on (`bg-surface-primary`, `text-text-primary`, etc. keep working) — this is a re-skin (new values under old names), not an API-breaking rewrite.

---

## 5. Resolved Decisions (formerly "Open Questions")

Every item below was a genuine open decision in the original draft. All four are now resolved — kept here in their original framing for traceability, each followed by its resolution.

1. **Satoshi font licensing/webfont availability.** This repo has direct precedent for a UI font swap being blocked on licensing (the commented-out Söhne config, `client/tailwind.config.cjs:17-20`, `style.css:461-559`). Satoshi is a commercial font (Indian Type Foundry, though it has a free-for-commercial-use license via Fontshare).
   **Resolved:** not a blocker — a commercial Cosmic-DS/Figma license is already held (Decision 1). Proceed with Satoshi as `fontFamily.sans` in Phase 1.
2. **Fate of the shadcn "test styles" token block.** `client/tailwind.config.cjs:135-165` and `style.css:172-197,236-258` are explicitly marked as test/unused. Cosmic-DS's naming (`color/text/primary`, `color/interactive/primary/bg`) is structurally closer to LibreChat's own semantic set than to this shadcn block. The original draft recommended deleting it outright as part of Phase 1, pending a usage confirmation that was flagged as needed but not done.
   **Resolved:** that confirmation was performed for this revision (grep re-run 2026-08-13, see Decision 2) — the block is **not** dead (~60 live usages; only `bg-card`/`text-card-foreground` are unused). Do not delete blind. Phase 1 now carries an explicit migration sub-step mapping the live usages onto Cosmic-DS semantic tokens before the block is removed.
3. **"Temporary chat" mode color** (`ChatForm.tsx:549-550`, hardcoded `border-violet-800/60 bg-violet-950/10`). Cosmic-DS doesn't have an obvious 1:1 semantic token for this specific state from what was surfaced in this pass.
   **Resolved:** maps to Cosmic-DS's `color/brand/subtle` token (Decision 3) — already confirmed present in the `02 · Semantic / Color` collection (§3.1). No new Figma-side token needed.
4. **Runtime-overridable vs. static tokens.** `IThemeRGB` (the 49 tokens `ThemeProvider` can override per-user/per-deployment at runtime) currently covers only color. The original draft recommended the new radius/shadow/motion/z-index scales stay **static** (plain CSS vars / Tailwind theme values, not wired into `IThemeRGB`/`applyTheme`) since they're structural, not brand-color, values.
   **Resolved:** confirmed — they stay static (Decision 4). No runtime-overridability requirement; Phase 1 does not need to touch `packages/client/src/theme/types/index.ts`'s override surface for these scales.

---

## 6. Phased Sequencing

### Phase 1 — Token foundation (blocks everything else)
- Licensing and font questions are resolved (Decision 1) — no gate here.
- Pull full `get_variable_defs`/`get_design_context` coverage for the still-unconfirmed collections (likely `01 · Primitives / Color`, `03 · .../Spacing`, `06 · .../Typography`) to get the complete type ramp and spacing scale, not just the fragments surfaced in this pass.
- Rewrite `client/src/style.css`'s `html`/`.dark` variable blocks (§2.1, §2.3) with Cosmic-DS semantic values, under existing names; add dark-mode values from `05 · Dark Mode / Surfaces`. Names that must not change now explicitly include `text-destructive`/`border-destructive` (Decision 6) alongside the 49 `IThemeRGB`-covered names.
- Add new CSS variable scales for radius (`04 · Primitives / Radius`), shadow (effect styles), motion (`07 · Primitives / Motion`), z-index (`08 · Primitives / Z-index`) and wire them into `client/tailwind.config.cjs` (`theme.extend.borderRadius`, new `boxShadow`, `transitionDuration`/`transitionTimingFunction`, and a documented z-index scale). These scales stay static, not wired into `IThemeRGB`/`applyTheme` (Decision 4).
- **New:** apply the same `theme.extend` additions (colors + the new radius/shadow/motion/z-index scales) to `packages/client/tailwind.config.js`, or extract a shared `theme.extend` module both configs import (Decision 7) — otherwise `@librechat/client`'s own published `dist/style.css` build (via `createTailwindColors.js`) silently diverges from the in-monorepo app.
- Swap `fontFamily.sans` to Satoshi with proper `@font-face` blocks; `fontFamily.mono` needs no change (Roboto Mono already matches).
- Update `packages/client/src/theme/themes/default.ts`/`dark.ts` RGB values to match.
- **New, sequenced before any deletion:** migrate the shadcn token block's ~60 live usages onto Cosmic-DS semantic tokens (Decision 2) — either (a) redefine the existing CSS variables under Cosmic-DS semantic values in place and keep the block, or (b) migrate each of the ~10 consuming components (Select, Dropdown, DataTable, Radio, Switch, Slider, Checkbox, Table, Combobox, Breadcrumb, `OriginalDialog.tsx`, `OGDialogTemplate`) onto the LibreChat-named semantic tokens and then delete the block. `bg-card`/`text-card-foreground` (0 usages) can be dropped immediately either way.
- **New:** decide and record the visual-verification approach for this migration (Decision 10) — manual-QA-only, or add Playwright `toHaveScreenshot()` baselines / RTL token-value assertions first — before Phase 1 lands.

### Phase 2 — Shared primitive components (`packages/client/src/components/`)
- **Blocking precondition (Decision 9):** pull real `get_design_context` output per component (Button, Input, Badge, Avatar, card) to verify variant/prop parity with Cosmic-DS's component_sets before any code change in this phase — not a background verification task.
- Button, Input, Badge should re-skin mostly "for free" from Phase 1 value changes — verify against the pulled `get_design_context` output, don't assume.
- Avatar: replace hardcoded `rgb(121, 137, 255)` (`:54`) with a proper token reference.
- **Dialog consolidation, corrected scope (Decision 8):**
  1. Repoint `packages/client/src/components/DialogTemplate.tsx`'s internal import (`:2-9`) from `./Dialog` to `./OriginalDialog`, swapping `DialogClose/DialogContent/DialogDescription/DialogFooter/DialogHeader/DialogTitle` for the structurally-identical `OGDialogClose/OGDialogContent/OGDialogDescription/OGDialogFooter/OGDialogHeader/OGDialogTitle` exports (`OriginalDialog.tsx:241-251`). This single edit clears the dependency for all 35 files that import `DialogTemplate` (full verified list: `BookmarkEditDialog.tsx`, `DeleteBookmarkButton.tsx`, `DragDropModal.tsx`, `MCPConfigDialog.tsx`, `PresetItems.tsx`, `ShareButton.tsx`, `SaveAsPresetDialog.tsx`, `ExportModal.tsx`, `DeleteKeyDialog.tsx`, `ClearChats.tsx`, `DeleteCache.tsx`, `RevokeKeys.tsx`, `SharedLinks.tsx`, `ProjectCreateDialog.tsx`, `AdminSettings.tsx`, `DeletePrompt.tsx`, `ChatGroupItem.tsx`, `AgentTool.tsx`, `DeleteButton.tsx`, `ApiKeyDialog.tsx`, `ActionEditor.tsx`, `ToolsSection.spec.tsx`, `ToolsSection.tsx`, `VersionItem.spec.tsx`, `VersionItem.tsx`, `BookmarkCardActions.tsx`, `ActionsPanel.tsx`, `AssistantTool.tsx`, `ContextButton.tsx`, `MCPServerDialog/index.tsx`, `MemoryCardActions.tsx`, `MemoryCreateDialog.tsx`, `MemoryEditDialog.tsx`, `DeleteSkill.tsx`, `TermsAndConditionsModal.tsx`), without touching any of them.
  2. Migrate the 2 remaining direct external consumers of `Dialog.tsx` onto `OriginalDialog.tsx`'s `OG`-prefixed exports: `DangerButton.tsx` (`client/src/components/Nav/SettingsTabs/DangerButton.tsx:3`, uses `DialogButton` via the `@librechat/client` barrel) and `UploadFileModal.tsx` (`client/src/components/Files/FileList/UploadFileModal.tsx:2`, direct `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` import).
  3. Remove `export * from './Dialog'` from the barrel (`packages/client/src/components/index.ts:7`), re-verify zero remaining importers of `Dialog.tsx`, then delete `Dialog.tsx`.

### Phase 3 — Overlay & structural components
- Map Cosmic-DS's `modal-popover` → the consolidated Dialog, using `z/modal` and `blur/lg` for backdrop.
- Map `menu container` → the app's Radix `DropdownMenu`/`Popover` usage (exact files not yet located — discovery task) using `z/dropdown`/`z/tooltip`.
- Map `segmented-control` → the existing `.creative-tab`/`.fast-tab`/`.balanced-tab`/`.precise-tab` hardcoded-gradient tabs (`style.css:658-673`) — a genuine like-for-like replacement opportunity, not just a token swap.

### Phase 4 — Chat-critical surfaces
- `ChatForm.tsx` composer: replace `:465` hardcoded shadow/placeholder values; replace `:549-551`'s hardcoded `border-violet-800/60 bg-violet-950/10` with Cosmic-DS's `color/brand/subtle` token (Decision 3 — resolved, no longer pending).
- `MessageRender.tsx`/`Message.tsx`: replace legacy `text-token-text-primary` class with the token-backed Tailwind equivalent; leave the hardcoded width breakpoints (`:149-157`) unless Cosmic-DS defines layout/container tokens (not observed in this pass — check in Phase 1 follow-up).
- Verify sidebar (`UnifiedSidebar.tsx`, `Sidebar.tsx`, `SidePanelGroup.tsx`) re-skins correctly from Phase 1 alone (it's already token-driven) — this is a verification task, not new work, unless something surprises us.
- Wire in Progress Bar / Spinner components wherever streaming/loading UI currently exists (discovery task — not covered in this research pass).

### Phase 5 — Cleanup sweep
- Convert the remaining hardcoded-value CSS classes cataloged in §2.5 (`.btn-primary`, `.premium-scroll-button`, `.shimmer`, `.gemini-gradient`, `.azure-bg-color`) to token-driven equivalents.
- Remove the commented-out Söhne font block if Satoshi lands and Söhne is confirmed permanently dead.
- Investigate whether `packages/client/src/theme/atoms/themeAtoms.ts` (already marked `@deprecated`) and `packages/client/src/hooks/ThemeContext.old.tsx` (already unimported per the research pass) can be deleted outright — verify, don't assume, before deleting.

### Process note (all phases)
Each phase above needs its own `create_tdd_plan` companion document with real Given/When/Then behaviors, Red/Green cycles, and file-level change plans before its implementation begins (Decision 11). This document is the Phase-0 research input to that process, not a substitute for it.

---

## 7. Explicitly Out of Scope (First Pass)

- **App-wide sweep of every one-off hardcoded Tailwind color** outside `style.css` and the chat-critical surfaces listed above — 233+ files in `packages/client/src/components/` alone; Settings dialogs, Agent Builder, Prompts, Files, Share, MCP UI, and Artifacts-panel internals are not targeted for a dedicated pass (token *value* changes will cascade to them automatically since they consume the same CSS vars, but no verification or redesign work is planned for them here).
- **Pixel-perfect design-to-code translation** of every Cosmic-DS component via `get_design_context` — this plan maps *correspondences*, not full implementations; each phase item still needs its own `get_design_context` pull at implementation time.
- **Renaming the public CSS-variable/Tailwind-class API** (`--text-primary`, `bg-surface-primary`, etc.) — first pass changes *values* under *existing names* only (§2.3, §4.6).
- **Removing or altering the `ThemeProvider`/`IThemeRGB`/`REACT_APP_THEME_*` runtime override mechanism** — Cosmic-DS values become the new default theme; the override capability itself is untouched.
- **Publishing Figma Code Connect mappings** — not accessible on the current Figma plan/seat (§3, Caveat).
- **Any actual code change.** This document and its underlying research are the full deliverable of this task.

---

## Review Finding Traceability

| Review finding / explicit decision | Required resolution in this plan |
| --- | --- |
| Satoshi/Cosmic-DS licensing framed as open risk (Open Question §5.1) | Decision 1; §5.1 resolved; Phase 1 no longer gated |
| Shadcn token block recommended for outright deletion despite unconfirmed usage (Open Question §5.2) | Decision 2; §5.2 resolved; Phase 1 migration sub-step added before any deletion |
| "Temporary chat" color had no mapped token (Open Question §5.3) | Decision 3; §5.3 resolved to `color/brand/subtle`; Phase 4 updated |
| Static-vs-runtime-overridable scales left as a confirmation ask (Open Question §5.4) | Decision 4; §5.4 resolved — static, no `IThemeRGB` wiring |
| Shadcn block has ~60 live usages, contradicting "delete outright" (Review Critical Issue 1) | Decision 2; re-verified independently (grep counts match review exactly); Phase 1 migration sub-step |
| Token count stated as "~40," actually 49 (Review Contract finding) | Decision 5; all "~40" references corrected |
| `text-destructive`/`border-destructive` excluded from the load-bearing name inventory (Review Contract finding) | Decision 6; added to the protected-name list in Phase 1 |
| Second live Tailwind config (`packages/client/tailwind.config.js`) never mentioned (Review Critical Issue 3) | Decision 7; Phase 1 item added |
| `Dialog.tsx` deletion precondition false — real importers exist (Review Critical Issue 2) | Decision 8; re-verified and corrected beyond the review's own count (35 files via `DialogTemplate.tsx`, not 5); Phase 2 rewritten with the one-file-repoint fix |
| Component prop contracts unverified beyond Progress Bar (Review Contract/Interface finding) | Decision 9; Phase 2 blocking precondition |
| No tooling exists to falsify "re-skinned correctly" claims; a11y safety net disabled on this fork (Review Critical Issue 4) | Decision 10; Phase 1 decision-gate item added |
| No companion TDD plan exists for any phase (Review Test-Spec-Quality finding) | Decision 11; process note added under Phased Sequencing |

---

## 8. References

- Figma source: https://www.figma.com/design/eZxbwdGbKOm594wqBBfS69/Cosmic-DS?node-id=3-12
- Current theming docs: `packages/client/src/theme/README.md`
- Review incorporated into this revision: `thoughts/searchable/shared/plans/2026-08-13-08-59-cosmic-ds-frontend-reskin-plan-REVIEW.md`
- This plan supersedes its own pre-revision draft; no prior Cosmic-DS or design-system planning docs exist in `thoughts/`.
