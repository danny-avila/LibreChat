# White-Label Capability Plan for the LibreChat Fork

## Purpose

This plan covers only the **LibreChat fork** work required to add reusable white-label capabilities to LibreChat.

This is the capability layer that tenant-specific rollouts, such as Umniah, should build on later.

The goal is not to hardcode a tenant into the fork. The goal is to expose white-label extension points in a way that follows the patterns already established in this codebase.

---

## Core Design Principle

White-label customization in this repo should be split into **two distinct mechanisms**, because the code already splits the product that way:

1. **Runtime app configuration**
   This is for in-app behavior and branding that can be resolved after the server starts and sent through startup config.

2. **Build-time shell branding**
   This is for browser shell and static asset identity that must exist before `/api/config` is fetched.

The plan must follow the architecture already present in the repo:

- `custom config` -> `AppConfig` resolution -> `/api/config` -> frontend startup usage
- Vite/env/public-assets for static shell identity and boot-time branding
- ThemeProvider for dynamic color theme injection

This means white-label capability should **not** be implemented as:

- tenant-specific hardcoding in components
- a one-off `style.css` rewrite per customer
- a separate parallel config mechanism unrelated to `getAppConfig`

---

## What Is Already Supported

These capabilities already exist and should remain runtime-config driven:

- `APP_TITLE`
- `interface.customWelcome`
- `privacyPolicy`
- `termsOfService`
- `customFooter`
- `modelSpecs` labels, descriptions, defaults, grouping, and `iconURL`
- auth and registration toggles

Confirmed code paths:

- [`api/server/routes/config.js`](/Users/shqear/workspace/LibreChat/api/server/routes/config.js)
- [`packages/data-provider/src/config.ts`](/Users/shqear/workspace/LibreChat/packages/data-provider/src/config.ts)
- [`packages/api/src/app/service.ts`](/Users/shqear/workspace/LibreChat/packages/api/src/app/service.ts)
- [`packages/data-schemas/src/app/resolution.ts`](/Users/shqear/workspace/LibreChat/packages/data-schemas/src/app/resolution.ts)
- [`client/src/hooks/Config/useAppStartup.ts`](/Users/shqear/workspace/LibreChat/client/src/hooks/Config/useAppStartup.ts)
- [`client/src/routes/Layouts/Startup.tsx`](/Users/shqear/workspace/LibreChat/client/src/routes/Layouts/Startup.tsx)

These should not be reimplemented through source patching unless there is a concrete gap.

---

## What Is Still Hardcoded

These areas are not cleanly exposed through existing runtime config today:

- auth logo
  - [`client/src/components/Auth/AuthLayout.tsx`](/Users/shqear/workspace/LibreChat/client/src/components/Auth/AuthLayout.tsx)
- HTML shell title, description, theme color, favicon tags
  - [`client/index.html`](/Users/shqear/workspace/LibreChat/client/index.html)
- PWA manifest identity and icons
  - [`client/vite.config.ts`](/Users/shqear/workspace/LibreChat/client/vite.config.ts)
- attachment menu behavior for `Upload to Provider`
  - [`client/src/components/Chat/Input/Files/AttachFileMenu.tsx`](/Users/shqear/workspace/LibreChat/client/src/components/Chat/Input/Files/AttachFileMenu.tsx)

These are the correct targets for new capability work.

---

## Proper Capability Model

### 1. Add a formal `branding` config block

Do not keep expanding startup config with unrelated top-level fields like ad hoc `uiOverrides`.

Instead, add a real white-label block to custom config, then resolve it the same way the project already resolves `interface`, `mcpServers`, and `turnstile`.

Proposed shape at the custom-config level:

```ts
branding?: {
  appLogo?: string;
  authLogo?: string;
  favicon?: string;
  theme?: {
    light?: IThemeRGB;
    dark?: IThemeRGB;
  };
  ui?: {
    hideProviderUploadForEndpoints?: string[];
  };
  meta?: {
    title?: string;
    description?: string;
    themeColor?: string;
    pwaName?: string;
    pwaShortName?: string;
    pwaBackgroundColor?: string;
    pwaThemeColor?: string;
  };
}
```

This should be modeled as part of `TCustomConfig`, then resolved into `brandingConfig` on `AppConfig`, following the existing resolution pattern.

Why this is the correct approach:

- it fits `getAppConfig`
- it fits DB overrides and tenant-specific merges
- it gives infra a standard config contract
- it keeps tenant data out of source code

### 2. Resolve branding through the existing app-config pipeline

The project standard is:

- load custom config
- process it into `AppConfig`
- merge override records
- expose safe frontend fields in `/api/config`

White-label capability should follow that exact pattern.

Concretely:

- extend `TCustomConfig` in [`packages/data-provider/src/config.ts`](/Users/shqear/workspace/LibreChat/packages/data-provider/src/config.ts)
- extend `AppConfig` in [`packages/data-schemas/src/types/app.ts`](/Users/shqear/workspace/LibreChat/packages/data-schemas/src/types/app.ts)
- add config-key remapping only if needed in [`packages/data-schemas/src/app/resolution.ts`](/Users/shqear/workspace/LibreChat/packages/data-schemas/src/app/resolution.ts)
- ensure branding survives `mergeConfigOverrides` in [`packages/data-schemas/src/app/resolution.ts`](/Users/shqear/workspace/LibreChat/packages/data-schemas/src/app/resolution.ts)
- expose a frontend-safe subset in [`api/server/routes/config.js`](/Users/shqear/workspace/LibreChat/api/server/routes/config.js)

This is the realistic, standards-aligned path.

---

## Runtime Customization Strategy

These capabilities should be controlled through startup config and not hardcoded in source.

### A. In-app branding

Use startup config for:

- app title
- welcome copy
- footer content
- privacy/terms links
- model labels/descriptions/icons
- auth behavior

This is already aligned with the project.

### B. UI behavior overrides

Use branding UI config for things like:

- hiding `Upload to Provider` on selected endpoints

Implementation target:

- [`client/src/components/Chat/Input/Files/AttachFileMenu.tsx`](/Users/shqear/workspace/LibreChat/client/src/components/Chat/Input/Files/AttachFileMenu.tsx)

Required behavior:

- if `startupConfig.branding.ui.hideProviderUploadForEndpoints` contains the current endpoint
- then omit `com_ui_upload_provider`
- while preserving:
  - `com_ui_upload_ocr_text`
  - `com_ui_upload_file_search`
  - other valid menu items

This should be driven from startup config because the component already reads startup config and that is consistent with the project’s frontend pattern.

### C. Runtime theme colors

Do not make `style.css` itself the tenant customization API.

The repo already has a dynamic theme pipeline:

- [`client/src/App.jsx`](/Users/shqear/workspace/LibreChat/client/src/App.jsx)
- [`client/src/utils/getThemeFromEnv.js`](/Users/shqear/workspace/LibreChat/client/src/utils/getThemeFromEnv.js)
- [`packages/client/src/theme/context/ThemeProvider.tsx`](/Users/shqear/workspace/LibreChat/packages/client/src/theme/context/ThemeProvider.tsx)
- [`packages/client/src/theme/types/index.ts`](/Users/shqear/workspace/LibreChat/packages/client/src/theme/types/index.ts)

The realistic white-label approach is:

- keep `client/src/style.css` as the default fallback theme
- support tenant theme colors via `branding.theme`
- feed resolved theme colors into the frontend through startup config or a boot-time config bridge
- use `ThemeProvider` to apply the tenant palette

If the tenant palette must be available before login or before user state loads, use the same boot-time path consistently for all tenants rather than rewriting CSS per tenant.

`style.css` should only be patched where the default token model is missing values, not as the main tenant-customization interface.

---

## Build-Time Customization Strategy

Some branding must exist before the app fetches startup config. Those capabilities should be treated as **build-time shell branding**.

### A. Static assets

Use `client/public/assets` as the stable asset contract for:

- logo
- favicons
- apple touch icon
- PWA icons

This is already how the app references these assets.

Capability requirement:

- make the app able to consume tenant-provided assets cleanly
- do not hardcode Umniah-specific asset names into component logic

### B. HTML shell metadata

These belong to build-time inputs, not startup config:

- HTML title fallback
- meta description
- browser `theme-color`
- favicon tag paths

Implementation targets:

- [`client/index.html`](/Users/shqear/workspace/LibreChat/client/index.html)
- [`client/vite.config.ts`](/Users/shqear/workspace/LibreChat/client/vite.config.ts)

The white-label capability should make these values tenant-configurable at build time.

### C. Auth/app logos

`AuthLayout.tsx` currently points directly to `assets/logo.svg`.

The realistic capability is:

- keep the component simple
- make the logo path come from resolved branding config when available
- otherwise fall back to the default asset path

This lets the capability follow the same runtime-config pattern while still using static assets.

---

## Concrete Implementation Work

### 1. Config and types

Add `branding` to the config schema and app config pipeline:

- [`packages/data-provider/src/config.ts`](/Users/shqear/workspace/LibreChat/packages/data-provider/src/config.ts)
- [`packages/data-schemas/src/types/app.ts`](/Users/shqear/workspace/LibreChat/packages/data-schemas/src/types/app.ts)
- app config resolution layer
- startup payload types

### 2. Startup payload

Expose a frontend-safe branding subset from:

- [`api/server/routes/config.js`](/Users/shqear/workspace/LibreChat/api/server/routes/config.js)

Do not expose unnecessary server-only values.

### 3. Frontend runtime wiring

Update the frontend to consume `startupConfig.branding` for:

- auth logo path
- UI visibility overrides
- optional runtime theme payload

### 4. Theme integration

Unify white-label theming with the existing `ThemeProvider` system instead of treating `style.css` as the tenant API.

If needed, extend the current theme env loader pattern into a startup-config-based theme loader so both build and runtime branding models can coexist cleanly.

### 5. Shell identity

Add build-time branding inputs for:

- `index.html`
- PWA manifest config in `vite.config.ts`
- public assets

---

## Validation

### Automated

Add or extend tests for:

- config schema accepts `branding`
- resolved app config includes branding
- startup payload includes branding subset
- attachment menu hides provider upload when configured
- auth branding path resolution works
- theme payload shape matches `ThemeProvider` expectations

### Manual

Verify a branded build shows:

- branded auth logo
- branded browser title and favicon
- branded PWA metadata
- branded in-app color palette
- hidden `Upload to Provider` where configured
- preserved `Upload as Text` and `File Search`

---

## Output of Phase 1

This fork should produce:

- a reusable white-label capability model
- a config-driven runtime branding path
- a build-time shell-branding path
- no tenant-specific source hardcoding
- a clean contract that infra can use for Umniah or any other tenant later

The fork should remain tenant-agnostic. The tenant selection, asset sourcing, env wiring, and deployment isolation belong in infra.
