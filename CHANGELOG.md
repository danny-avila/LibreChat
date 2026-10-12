# Changelog

Meo AI Web is currently a development preview. Entries here describe Meo-specific work in this fork rather than upstream LibreChat releases.

## Unreleased — preview

### Added

- Meo Account OAuth/OIDC sign-in and account-bound provider connections.
- Cloud-backed conversation history and per-conversation browser-session drafts.
- Streaming assistant replies with real request cancellation.
- Message and code-block copy actions.
- Clickable example prompts in the empty state.
- Branded favicon, social metadata, explicit `/new` SPA routing, and a branded 404 page.
- Keyboard focus styling, reduced-motion support, mobile sidebar overlay/Escape handling, and basic keyboard shortcuts.
- Build-time browser JavaScript syntax verification.

### Fixed

- IME composition no longer sends a message when Enter is used to confirm Chinese/Japanese input.
- Streaming no longer rebuilds the complete message list for every delta.
- Auto-scroll follows new output only when the reader was already near the bottom.
- User-facing failures are grouped into stable network, authorization, provider, cancellation, and fallback messages instead of exposing raw HTTP errors.
- OAuth/API tests now use the current OIDC UserInfo contract (`/auth/v1/oauth/userinfo` + `sub`).

### Known limitations

- Conversation search and a full command palette are not implemented yet.
- Markdown rendering is intentionally small and does not yet provide full CommonMark/GFM coverage or syntax highlighting.
- Initial/history loading states are functional but not yet polished with skeleton UI.
- Web colors still use local CSS variables rather than shared MeoUI semantic tokens.
- Social metadata does not yet include a dedicated Open Graph preview image.
- Real-device validation is still required for mobile browsers, IME edge cases, accessibility tooling, and long-running streams.

## Upstream

This repository remains a LibreChat fork. Upstream release history and documentation are preserved in [`UPSTREAM.md`](./UPSTREAM.md).
