# Changelog

All notable changes to this project will be documented in this file.


## [Unreleased]

### ✨ New Features

- 🔍 feat: Mistral OCR API / Upload Files as Text by **@danny-avila** in [#6274](https://github.com/danny-avila/LibreChat/pull/6274)
- 🤖 feat: Support OpenAI Web Search models by **@danny-avila** in [#6313](https://github.com/danny-avila/LibreChat/pull/6313)
- 🔗 feat: Agent Chain (Mixture-of-Agents) by **@danny-avila** in [#6374](https://github.com/danny-avila/LibreChat/pull/6374)
- ⌛ feat: `initTimeout` for Slow Starting MCP Servers by **@perweij** in [#6383](https://github.com/danny-avila/LibreChat/pull/6383)
- 🚀 feat: `S3` Integration for File handling and Image uploads by **@rubentalstra** in [#6142](https://github.com/danny-avila/LibreChat/pull/6142)
- 🔒feat: Enable OpenID Auto-Redirect by **@leondape** in [#6066](https://github.com/danny-avila/LibreChat/pull/6066)
- 🚀 feat: Integrate `Azure Blob Storage` for file handling and image uploads by **@rubentalstra** in [#6153](https://github.com/danny-avila/LibreChat/pull/6153)
- 🚀 feat: Add support for custom `AWS` endpoint in `S3` by **@rubentalstra** in [#6431](https://github.com/danny-avila/LibreChat/pull/6431)
- 🚀 feat: Add support for LDAP STARTTLS in LDAP authentication by **@rubentalstra** in [#6438](https://github.com/danny-avila/LibreChat/pull/6438)
- 🚀 feat: Refactor schema exports and update package version to 0.0.4 by **@rubentalstra** in [#6455](https://github.com/danny-avila/LibreChat/pull/6455)
- 🔼 feat: Add Auto Submit For URL Query Params by **@mjaverto** in [#6440](https://github.com/danny-avila/LibreChat/pull/6440)
- 🛠 feat: Enhance Redis Integration, Rate Limiters & Log Headers by **@danny-avila** in [#6462](https://github.com/danny-avila/LibreChat/pull/6462)
- 💵 feat: Add Automatic Balance Refill by **@rubentalstra** in [#6452](https://github.com/danny-avila/LibreChat/pull/6452)
- 🗣️ feat: add support for gpt-4o-transcribe models by **@berry-13** in [#6483](https://github.com/danny-avila/LibreChat/pull/6483)
- 🎨 feat: UI Refresh for Enhanced UX by **@berry-13** in [#6346](https://github.com/danny-avila/LibreChat/pull/6346)
- 🌍 feat: Add support for Hungarian language localization by **@rubentalstra** in [#6508](https://github.com/danny-avila/LibreChat/pull/6508)
- 🚀 feat: Add Gemini 2.5 Token/Context Values, Increase Max Possible Output to 64k by **@danny-avila** in [#6563](https://github.com/danny-avila/LibreChat/pull/6563)
- 🚀 feat: Enhance MCP Connections For Multi-User Support by **@danny-avila** in [#6610](https://github.com/danny-avila/LibreChat/pull/6610)

### 🌍 Internationalization

- 🌍 i18n: Add Thai Language Support and Update Translations by **@rubentalstra** in [#6219](https://github.com/danny-avila/LibreChat/pull/6219)
- 🌍 i18n: Update translation.json with latest translations by **@github-actions[bot]** in [#6220](https://github.com/danny-avila/LibreChat/pull/6220)
- 🌍 i18n: Update translation.json with latest translations by **@github-actions[bot]** in [#6240](https://github.com/danny-avila/LibreChat/pull/6240)
- 🌍 i18n: Update translation.json with latest translations by **@github-actions[bot]** in [#6241](https://github.com/danny-avila/LibreChat/pull/6241)
- 🌍 i18n: Update translation.json with latest translations by **@github-actions[bot]** in [#6277](https://github.com/danny-avila/LibreChat/pull/6277)
- 🌍 i18n: Update translation.json with latest translations by **@github-actions[bot]** in [#6414](https://github.com/danny-avila/LibreChat/pull/6414)
- 🌍 i18n: Update translation.json with latest translations by **@github-actions[bot]** in [#6505](https://github.com/danny-avila/LibreChat/pull/6505)

### 👐 Accessibility

- 🎨 a11y: Update Model Spec Description Text by **@berry-13** in [#6294](https://github.com/danny-avila/LibreChat/pull/6294)

### 🔧 Fixes

- 🐛 fix: Avatar Type Definitions in Agent/Assistant Schemas by **@danny-avila** in [#6235](https://github.com/danny-avila/LibreChat/pull/6235)
- 🔧 fix: MeiliSearch Field Error and Patch Incorrect Import by #6210 by **@rubentalstra** in [#6245](https://github.com/danny-avila/LibreChat/pull/6245)
- 🔏 fix: Enhance Two-Factor Authentication by **@rubentalstra** in [#6247](https://github.com/danny-avila/LibreChat/pull/6247)
- 🐛 fix: Await saveMessage in abortMiddleware to ensure proper execution by **@sh4shii** in [#6248](https://github.com/danny-avila/LibreChat/pull/6248)
- 🔧 fix: Axios Proxy Usage And Bump `mongoose` by **@danny-avila** in [#6298](https://github.com/danny-avila/LibreChat/pull/6298)
- 🔧 fix: comment out MCP servers to resolve service run issues by **@thecodingwizardx** in [#6316](https://github.com/danny-avila/LibreChat/pull/6316)
- 🔧 fix: Update Token Calculations and Mapping, MCP `env` Initialization by **@danny-avila** in [#6406](https://github.com/danny-avila/LibreChat/pull/6406)
- 🐞 fix: Agent "Resend" Message Attachments + Source Icon Styling by **@danny-avila** in [#6408](https://github.com/danny-avila/LibreChat/pull/6408)
- 🐛 fix: Prevent Crash on Duplicate Message ID by **@Odrec** in [#6392](https://github.com/danny-avila/LibreChat/pull/6392)
- 🔐 fix: Invalid Key Length in 2FA Encryption by **@rubentalstra** in [#6432](https://github.com/danny-avila/LibreChat/pull/6432)
- 🏗️ fix: Fix Agents Token Spend Race Conditions, Expand Test Coverage by **@danny-avila** in [#6480](https://github.com/danny-avila/LibreChat/pull/6480)
- 🔃 fix: Draft Clearing, Claude Titles, Remove Default Vision Max Tokens by **@danny-avila** in [#6501](https://github.com/danny-avila/LibreChat/pull/6501)
- 🔧 fix: Update username reference to use user.name in greeting display by **@rubentalstra** in [#6534](https://github.com/danny-avila/LibreChat/pull/6534)
- 🔧 fix: S3 Download Stream with Key Extraction and Blob Storage Encoding for Vision by **@danny-avila** in [#6557](https://github.com/danny-avila/LibreChat/pull/6557)
- 🔧 fix: Mistral type strictness for `usage` & update token values/windows by **@danny-avila** in [#6562](https://github.com/danny-avila/LibreChat/pull/6562)
- 🔧 fix: Consolidate Text Parsing and TTS Edge Initialization by **@danny-avila** in [#6582](https://github.com/danny-avila/LibreChat/pull/6582)
- 🔧 fix: Ensure continuation in image processing on base64 encoding from Blob Storage by **@danny-avila** in [#6619](https://github.com/danny-avila/LibreChat/pull/6619)
- ✉️ fix: Fallback For User Name In Email Templates by **@danny-avila** in [#6620](https://github.com/danny-avila/LibreChat/pull/6620)

### ⚙️ Other Changes

- 📦 refactor: Move DB Models to `@librechat/data-schemas` by **@rubentalstra** in [#6210](https://github.com/danny-avila/LibreChat/pull/6210)
- 📦 chore: Patch `axios` to address CVE-2025-27152 by **@danny-avila** in [#6222](https://github.com/danny-avila/LibreChat/pull/6222)
- ⚠️ refactor: Use Error Content Part Instead Of Throwing Error for Agents by **@danny-avila** in [#6262](https://github.com/danny-avila/LibreChat/pull/6262)
- 🏃‍♂️ refactor: Improve Agent Run Context & Misc. Changes by **@danny-avila** in [#6448](https://github.com/danny-avila/LibreChat/pull/6448)
- 📝 docs: librechat.example.yaml by **@ineiti** in [#6442](https://github.com/danny-avila/LibreChat/pull/6442)
- 🏃‍♂️ refactor: More Agent Context Improvements during Run by **@danny-avila** in [#6477](https://github.com/danny-avila/LibreChat/pull/6477)
- 🔃 refactor: Allow streaming for `o1` models by **@danny-avila** in [#6509](https://github.com/danny-avila/LibreChat/pull/6509)
- 🔧 chore: `Vite` Plugin Upgrades & Config Optimizations by **@rubentalstra** in [#6547](https://github.com/danny-avila/LibreChat/pull/6547)
- 🔧 refactor: Consolidate Logging, Model Selection & Actions Optimizations, Minor Fixes by **@danny-avila** in [#6553](https://github.com/danny-avila/LibreChat/pull/6553)
- 🎨 style: Address Minor UI Refresh Issues by **@berry-13** in [#6552](https://github.com/danny-avila/LibreChat/pull/6552)
- 🔧 refactor: Enhance Model & Endpoint Configurations with Global Indicators 🌍 by **@berry-13** in [#6578](https://github.com/danny-avila/LibreChat/pull/6578)
- 💬 style: Chat UI, Greeting, and Message adjustments by **@berry-13** in [#6612](https://github.com/danny-avila/LibreChat/pull/6612)



---
