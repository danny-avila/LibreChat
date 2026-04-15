# ClickHouse Tool Call UI — Build Notes

## What this PR does

Adds rich rendering for ClickHouse MCP tool call results using `@clickhouse/click-ui` components:

- **Tabbed layout** (Query / Result / Details) with auto-selection
- **Virtualized Grid** (`click-ui Grid`) for `run_select_query` results with column filter and pagination
- **Collapsible rows** for `get_services_list` and `list_tables`
- **Static key-value layout** for `get_service_details`
- **Cost visualization** with By Entity / By Date toggle and daily/weekly grouping
- **SQL/JSON syntax highlighting** using lowlight with Click UI's color theme
- **42 unit tests** for all helper/parsing functions

## The production build problem

### Root cause

`@clickhouse/click-ui` transitively depends on `styled-components@6.4.0`, which is nested at `@clickhouse/click-ui/node_modules/styled-components/`. When Rollup builds the production bundle, it places all unmatched `node_modules` into a single `vendor` chunk via the `manualChunks` config.

Adding styled-components (and other click-ui transitive deps) to vendor **changes Rollup's CJS interop wrapping for React**. React is a CJS package with a conditional `require()` pattern:

```js
// react/index.js
if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/react.production.min.js');
}
```

Rollup converts this to ESM, but the conversion is sensitive to what other modules share the chunk. When styled-components (ESM, importing React) lands in the same chunk, it disrupts the initialization order. Other chunks that import React from vendor (`radix-ui`, `tanstack-vendor`) then see `undefined` for core React APIs.

This is NOT a bug in our code — it's a Rollup CJS interop edge case triggered by the specific combination of modules in the vendor chunk.

### What we tried and the errors we got

#### 1. CodeBlock import pulls in react-syntax-highlighter (CJS conflict)

Click UI's `CodeBlock` imports `react-syntax-highlighter`, which bundles CJS `lowlight@1.20.0` / `highlight.js@10.7.3` / `fault@1.0.4`. LibreChat already has ESM `lowlight@2.9.0` / `highlight.js@11.8.0` / `fault@2.0.1`.

The `markdown_highlight` chunk rule catches the hoisted ESM copies but NOT the nested CJS copies. The CJS `fault@1.0.4` ends up in `vendor` and its cross-chunk `require('format')` fails:

```
Uncaught TypeError: Cannot set properties of undefined (setting 'exports')
    at vendor.js:1:...
```

#### 2. `resolve.alias` to deduplicate highlight.js/lowlight

Tried forcing all imports to resolve to the hoisted ESM copies:

```js
resolve: {
  alias: {
    'highlight.js': path.resolve(__dirname, '../node_modules/highlight.js'),
    'lowlight': path.resolve(__dirname, '../node_modules/lowlight'),
  }
}
```

Failed because highlight.js v10→v11 is a breaking major version change. react-syntax-highlighter was written for v10 and crashes on v11's API:

```
Error: Could not find the language 'c-like', did you forget to load/include a language module?
```

(`highlight.js@11` removed `languages/c-like` which react-syntax-highlighter's async loader imports.)

#### 3. Adding `fault`/`format` to the `markdown_highlight` chunk

Tried widening the chunk rule to catch the CJS deps:

```js
if (
  normalizedId.includes('node_modules/highlight.js') ||
  normalizedId.includes('node_modules/lowlight') ||
  normalizedId.includes('node_modules/fault') ||
  normalizedId.includes('node_modules/format')
) {
  return 'markdown_highlight';
}
```

Even adding a single 10-line CJS package (`format`) to a different chunk changed what was in `vendor`, reordering Rollup's module initialization graph:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'useSyncExternalStore')
    at tanstack-vendor.js:1:39086
```

#### 4. Removing `CodeBlock` import (tree-shaking RSH out)

Replaced `CodeBlock` with a plain `<pre><code>` component. With `sideEffects: false` in click-ui's package.json, Rollup tree-shakes react-syntax-highlighter out entirely. But styled-components ALONE in vendor is enough to break React's CJS interop:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'forwardRef')
    at radix-ui.js:1:851
```

Traced to vendor exports: `reactExports` (Rollup's CJS wrapper for React's `module.exports`) was not fully initialized when the `radix-ui` chunk tried to access it.

#### 5. `build.commonjsOptions` tweaks

Tried `strictRequires`, `transformMixedEsModules`, `requireReturnsDefault: 'auto'` — all just shifted the error to a different chunk or a different React API being undefined.

#### 6. Virtual Vite plugin to bypass `use-sync-external-store/shim`

`use-sync-external-store/shim` is a CJS module with the same conditional require pattern as React. Created a virtual module to bypass it:

```js
{
  name: 'use-sync-external-store-shim',
  enforce: 'pre',
  resolveId(id) {
    if (id.startsWith('use-sync-external-store/shim'))
      return '\0virtual:use-sync-external-store-shim';
  },
  load(id) {
    if (id === '\0virtual:use-sync-external-store-shim')
      return 'import { useSyncExternalStore } from "react";\nexport { useSyncExternalStore };\nexport default { useSyncExternalStore };';
  },
}
```

Fixed the tanstack error but created a TDZ (temporal dead zone) violation. The virtual module inlined into vendor depended on React's initialization, but another module accessed it first:

```
Uncaught ReferenceError: Cannot access 'useSyncExternalStoreExports' before initialization
    at vendor.js:1:359750
```

(`@ariakit/react-core` imports the shim as a default import and destructures it at module scope.)

#### 7. Chunk isolation + restoring CodeBlock import

After fixing the vendor chunk with the click-ui isolation rule, we tried adding CodeBlock back. CodeBlock pulls react-syntax-highlighter into the `click-ui` chunk, but RSH imports `lowlight` which resolves to the hoisted ESM `lowlight@2.x` in the `markdown_highlight` chunk. This creates a circular chunk dependency (click-ui → markdown_highlight → vendor → click-ui), causing a TDZ violation:

```
Uncaught ReferenceError: Cannot access 'lowlight' before initialization
    at vendor.js:1:2601745
```

CodeBlock is fundamentally incompatible with LibreChat's build as long as it depends on react-syntax-highlighter.

### The fix (2 changes to `vite.config.ts`)

**1. Isolate click-ui in its own manual chunk**

```js
// click-ui and ALL its nested deps (styled-components, etc.) must stay
// out of vendor to avoid disrupting React's CJS interop in that chunk.
if (normalizedId.includes('@clickhouse/click-ui')) {
  return 'click-ui';
}
```

Since `styled-components` is nested at `@clickhouse/click-ui/node_modules/styled-components/`, the path includes `@clickhouse/click-ui`, so this single rule catches click-ui AND all its transitive dependencies. Vendor stays identical to the `dev` branch → React CJS interop works.

The `click-ui` chunk (914KB) only loads when a ClickHouse tool call renders (lazy-loaded via `React.lazy`).

**2. Bump PWA precache limit to 5MB**

`maximumFileSizeToCacheInBytes: 5 * 1024 * 1024` — click-ui's transitive deps add ~1MB to the overall bundle, pushing vendor past the old 4MB limit.

### Why we don't use Click UI's `CodeBlock`

Click UI's `CodeBlock` imports `react-syntax-highlighter`, which bundles its own CJS copies of `lowlight@1.20.0` and `highlight.js@10.7.3`. Even with click-ui isolated in its own chunk, having two lowlight/highlight.js version trees creates cross-chunk CJS `require()` failures.

Instead, we use a lightweight `CodeDisplay` component that calls `lowlight` (the same ESM copy already loaded by rehype-highlight) and applies Click UI's exact color theme via scoped CSS classes (`.ch-code .hljs-keyword` etc., extracted from click-ui's `useColorStyle.js`). Zero additional bundle cost.

### When this can be simplified

Click UI is migrating from styled-components to CSS modules (PRs #810, #956 — per-component migration in progress). Once that lands:

1. styled-components drops out of click-ui's dependency tree
2. The `click-ui` manual chunk rule may no longer be needed (test by removing it and checking prod build)
3. `CodeBlock` may become usable again if react-syntax-highlighter is also removed or updated to use ESM lowlight

## Files changed

| File | What |
|------|------|
| `client/vite.config.ts` | click-ui chunk isolation + PWA limit bump |
| `ClickHouse/ClickHouseToolCall.tsx` | Main component — tabs, Grid, collapsible rows, CodeDisplay |
| `ClickHouse/CostView.tsx` | Cost visualization with entity/date grouping |
| `ClickHouse/types.ts` | All interfaces and constants |
| `ClickHouse/helpers.ts` | All pure parsing/formatting functions |
| `ClickHouse/index.ts` | Barrel export |
| `ClickHouse/__tests__/helpers.test.ts` | 42 unit tests |
| `ToolCall.tsx` | Passes `functionName` prop through |
| `ToolCallInfo.tsx` | Lazy-loads ClickHouseToolCall when `domain` matches `clickhouse` |
| `locales/en/translation.json` | 14 new i18n keys (`com_ch_*`) |
| `client/package.json` | Added `@clickhouse/click-ui`, bumped react to ^18.3.1 |
| `packages/client/package.json` | Matching react bump for devDeps |
