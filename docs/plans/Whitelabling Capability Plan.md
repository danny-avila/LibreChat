# White-Label Capability Plan for the LibreChat Fork

## Purpose

This plan covers only the **LibreChat fork** work required to add reusable white-label capabilities to LibreChat.

This is **Phase 1** of the larger Umniah rollout and should be executed **before** the infra repo plan.

The broader program is:

1. Phase 1: implement tenant-agnostic white-label capabilities in this fork
2. Phase 2: configure and deploy those capabilities for Umniah in the infra repo on `umniah.ai.shqear.online`

---

## Summary

Use this fork as the source for generic white-label features that can later be configured for Umniah or any other tenant.

The fork work should:

- keep LibreChat’s supported config-driven customization where it already exists
- patch source only where the product still hardcodes branding or unsupported UI behavior
- produce a buildable LibreChat source tree with reusable white-label capabilities for infra to configure during deployment

The output of this repo is not a tenant-branded app hardcoded for one customer. It is a reusable application variant that exposes the branding and behavior extension points infra needs.

---

## Investigated Code Paths

The required customization points are already clear from the source:

- [`client/src/components/Auth/AuthLayout.tsx`](/Users/shqear/workspace/LibreChat/client/src/components/Auth/AuthLayout.tsx)
  - auth page logo is hardcoded as `assets/logo.svg`
- [`client/index.html`](/Users/shqear/workspace/LibreChat/client/index.html)
  - static title, description, browser theme color, favicon links are hardcoded
- [`client/vite.config.ts`](/Users/shqear/workspace/LibreChat/client/vite.config.ts)
  - PWA manifest identity and icons are hardcoded
- [`client/src/style.css`](/Users/shqear/workspace/LibreChat/client/src/style.css)
  - product-wide color tokens are defined here
- [`client/src/components/Chat/Input/Files/AttachFileMenu.tsx`](/Users/shqear/workspace/LibreChat/client/src/components/Chat/Input/Files/AttachFileMenu.tsx)
  - `Upload to Provider`, `Upload as Text`, and `File Search` menu items are explicitly built here
- [`api/server/routes/config.js`](/Users/shqear/workspace/LibreChat/api/server/routes/config.js)
  - startup config payload is assembled here
- [`packages/data-provider/src/config.ts`](/Users/shqear/workspace/LibreChat/packages/data-provider/src/config.ts)
  - startup config schema/types live here

Also confirmed:

- `APP_TITLE` is already supported through startup config
- `interface.customWelcome` is already supported
- `privacyPolicy`, `termsOfService`, and `customFooter` are already supported
- `modelSpecs.iconURL`, labels, descriptions, grouping, and defaults are already supported

So those do **not** need source-level reinvention.

---

## Implementation Changes

### 1. Extend startup config for generic UI overrides

Add a formal startup-config section for frontend behavior that is not currently configurable.

Add a field like:

```ts
uiOverrides?: {
  hideProviderUploadForEndpoints?: string[];
}
```

Plumb it through:

- [`packages/data-provider/src/config.ts`](/Users/shqear/workspace/LibreChat/packages/data-provider/src/config.ts)
- [`api/server/routes/config.js`](/Users/shqear/workspace/LibreChat/api/server/routes/config.js)

This should be a real part of `TStartupConfig`, not a local-only constant.

### 2. Keep supported branding in runtime config

Continue using supported runtime config for:

- `APP_TITLE`
- `interface.customWelcome`
- `customFooter`
- `privacyPolicy`
- `termsOfService`
- model labels/descriptions/defaults
- model `iconURL`
- auth and registration behavior

This avoids unnecessary fork drift and keeps the white-label maintainable.

The fork should remain secret-free:

- do not commit production secrets in this repo
- do not introduce tenant-specific `UMNIAH_*` parsing in application code unless there is a strong reason
- expect infra to provide standard LibreChat runtime env names such as `APP_TITLE`, `DOMAIN_CLIENT`, `DOMAIN_SERVER`, and OAuth settings

Tenant isolation belongs in infra. The fork should stay as close as possible to normal LibreChat runtime expectations.

### 3. Replace hardcoded static assets with configurable branding assets

Add a generic white-label asset mechanism under [`client/public/assets`](/Users/shqear/workspace/LibreChat/client/public/assets) and/or through runtime-configurable asset references.

The fork should support a full branded asset set such as:

- `logo.svg`
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon-180x180.png`
- `icon-192x192.png`
- `maskable-icon.png`

These should be treated as white-label inputs, not as Umniah-only files baked permanently into the fork.

For the Umniah rollout specifically, the infra/execution work will source the initial branding inputs from:

- official Umniah branding from `umniah.com`
- current palette signal from site investigation:
  - `#323E48`
  - `#CE0037`
  - white and neutral grays
- current logo source discovered from the official site:
  - `https://www.umniah.com/storage/umnia-beyon-2.png`

If a proper SVG/brand kit becomes available, it should replace the temporary web-fetched source material.

The fork requirement is to support branded assets cleanly. The Umniah-specific asset acquisition strategy is:

- fetch the current public Umniah logo and favicon-compatible source material from official Umniah web properties
- treat `umniah.com` as the source of truth, with Logodix used only as a visual reference and not as the authoritative asset source
- generate the initial app asset set from those web-fetched inputs

The fork should make these deliverables possible:

- `client/public/assets/logo.svg`
- `client/public/assets/favicon-16x16.png`
- `client/public/assets/favicon-32x32.png`
- `client/public/assets/apple-touch-icon-180x180.png`
- `client/public/assets/icon-192x192.png`
- `client/public/assets/maskable-icon.png`

The plan assumes the execution work for Umniah will fetch the latest usable public assets from the web, then normalize them into the required LibreChat asset formats before commit or packaging.

### 4. Patch auth and shell branding to use configurable white-label identity

Update:

- [`client/src/components/Auth/AuthLayout.tsx`](/Users/shqear/workspace/LibreChat/client/src/components/Auth/AuthLayout.tsx)
  - ensure auth uses a configurable logo source
  - keep alt text based on runtime `appTitle`
- [`client/index.html`](/Users/shqear/workspace/LibreChat/client/index.html)
  - replace hardcoded title/description/theme-color defaults with configurable branding inputs
  - point icon links at configurable branded assets
- [`client/vite.config.ts`](/Users/shqear/workspace/LibreChat/client/vite.config.ts)
  - support configurable PWA `name`
  - support configurable `short_name`
  - support configurable `theme_color`
  - support configurable `background_color`
  - point manifest icons at branded assets

This covers:

- auth branding
- browser tab identity
- favicon identity
- installed-app identity

### 5. Patch theme tokens to support tenant branding

Update [`client/src/style.css`](/Users/shqear/workspace/LibreChat/client/src/style.css) so tenant branding colors can be represented at the token layer.

Focus on:

- `--text-*`
- `--surface-*`
- `--header-*`
- `--border-*`
- `--ring-primary`
- `--primary`
- any remaining product accent tokens that currently assume LibreChat defaults

This is the correct place to apply white-label color treatment because the existing UI already consumes these variables broadly. The fork should expose the mechanism; infra chooses the actual tenant palette.

### 6. Hide `Upload to Provider` through generic endpoint-level UI controls

Patch [`client/src/components/Chat/Input/Files/AttachFileMenu.tsx`](/Users/shqear/workspace/LibreChat/client/src/components/Chat/Input/Files/AttachFileMenu.tsx) so that:

- if the current endpoint is listed in `startupConfig.uiOverrides.hideProviderUploadForEndpoints`
- the `com_ui_upload_provider` menu item is omitted
- `Upload as Text` and `File Search` remain available when their capabilities are enabled

This must be driven from startup config, not from an inline hardcoded `if (endpoint === 'LiteLLM')` branch.

### 7. Keep model presentation config-driven

Do not patch model menus just to rename or decorate models.

Use `modelSpecs` for:

- labels
- descriptions
- default spec
- grouping
- `iconURL`

This is already supported and should remain data-driven.

---

## Validation

Add or extend tests for:

- startup config schema includes `uiOverrides`
- startup payload includes `uiOverrides` when configured
- attachment menu omits provider upload when the override is active
- text/file-search upload options still work under the override
- branded assets are referenced by auth shell, HTML shell, and PWA manifest
- app title still derives correctly from startup config

Manual verification in the fork build:

- auth screen shows the configured tenant logo
- browser tab and favicon reflect configured tenant identity
- theme reflects configured tenant branding
- `Upload to Provider` is hidden for the intended endpoint
- `Upload as Text` remains visible

## Fork Handoff Checklist

Before infra work starts, this fork must have all of the following complete:

- generic branding asset support implemented
- auth branding extension points implemented
- HTML shell branding extension points implemented
- PWA manifest branding extension points implemented
- theme token branding extension points implemented
- startup config extension for `uiOverrides.hideProviderUploadForEndpoints` implemented
- attachment menu behavior patched and verified
- local build/test verification completed for the affected areas
- a pinned fork branch, tag, or commit selected for infra deployment

---

## Build Handoff to Infra

This fork is not required to publish a Docker image before rollout.

The deployment contract is:

- this repo carries the source patches and assets for the Umniah variant
- this repo should remain tenant-agnostic and expose reusable branding capabilities rather than hardcoding one tenant
- infra builds that source during deployment on the VPS
- infra owns the `UMNIAH_*` env namespace and maps it into standard LibreChat runtime envs at compose level
- the infra compose setup should follow the same build-on-deploy pattern previously used in this repo for LibreChat, with a pinned repo/ref instead of a floating upstream image

That means the fork work must stay compatible with a deterministic Docker build from source, but image publication is not part of Phase 1.

## Output of This Repo

This repo should produce:

- a buildable LibreChat source tree with generic white-label capabilities
- the source patches required to support tenant-level white-labeling in infra
- any new startup config fields required by the customized frontend
- a clear repo/ref contract for infra to build during deploy

That output becomes the input artifact for the infra repo plan.

---

## Decision Summary

- Execute this fork plan first.
- Use runtime config where LibreChat already supports customization.
- Patch source only where branding or behavior is hardcoded.
- Keep the fork tenant-agnostic; Umniah-specific values belong in infra/runtime configuration.
