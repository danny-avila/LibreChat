# LibreChat iOS App Developer Plan

This document outlines a practical plan to ship an iOS app based on the existing LibreChat web app. It assumes the backend remains Node/Express and the current React frontend is the primary UI source of truth.

## Goals
- Reuse as much of the existing web UI as possible while delivering a native-feeling iOS experience.
- Preserve backend behavior, SSE streaming, and authentication flows.
- Ship through TestFlight with a reliable CI/CD pipeline.

## Recommended Approach

Primary path: Capacitor wrapper around the existing Vite/React app.

Why:
- Fastest path to a production iOS app without rewriting UI.
- Good support for push notifications, deep links, camera/photo, and secure storage.
- Keeps web app as the single source of UI truth.

Alternative paths:
- React Native rewrite of `client/` (larger effort; only if you need full native UI performance).
- Native iOS with embedded WebView (fastest initial ship, lowest native integration).

## Phase 0: Discovery and Constraints (1-2 days)
- Identify platform requirements: offline needs, push notifications, biometric auth, file uploads, and background tasks.
- Confirm authentication flows used by the web app (cookies, tokens, OAuth).
- Validate streaming transport (SSE) compatibility with iOS networking stack.
- Confirm minimum iOS version target (recommend iOS 15+).

Deliverable: a short decision memo on framework choice, auth strategy, and minimum OS support.

## Phase 1: App Shell + Build Setup (2-4 days)

### 1) Bootstrap Capacitor
- Add `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`.
- Create `ios/` project with `npx cap init` and `npx cap add ios`.
- Configure app id, display name, and build targets.

### 2) Vite build output
- Ensure `client/` builds to a static directory suitable for Capacitor.
- Add a dedicated build script in `package.json` (example):
  - `npm run ios:build` -> build client and sync capacitor assets.

### 3) Dev workflow
- Use `npx cap open ios` for Xcode.
- Add `npm run ios:sync` to push changes into the native bundle.

Deliverable: iOS simulator build loading the web UI.

## Phase 2: Auth, Storage, and Networking (3-6 days)

### 1) Authentication
- If the web app relies on cookies:
  - Prefer token-based auth for mobile (refresh token stored in Keychain).
  - Add a dedicated mobile auth endpoint if needed.
- If OAuth flows are required:
  - Use Capacitor Browser and App Auth style deep links.
  - Register iOS URL schemes.

### 2) Secure storage
- Use `@capacitor/preferences` for non-sensitive settings.
- Use `@capacitor-community/secure-storage` (or Keychain) for tokens.

### 3) Networking + SSE
- Confirm SSE works inside WKWebView (it usually does).
- If SSE is blocked, add a fallback WebSocket or long-polling endpoint.
- Make sure CORS and cookie policies allow WKWebView origins.

Deliverable: login, session persistence, and streaming responses working in iOS.

## Phase 3: Native Features (optional, 4-8 days)

### 1) Push Notifications
- Add APNs setup and server push service.
- Decide on provider (APNs direct or via a service).
- Implement device token registration and opt-in UX.

### 2) File uploads & camera
- Add Capacitor plugins for camera/photo library.
- Validate file upload and size limits in API.

### 3) Deep linking
- Register URL schemes and universal links.
- Route deep links into the client router.

Deliverable: any native-only capabilities required for parity with competitors.

## Phase 4: QA, Performance, and Accessibility (3-6 days)
- Test on real devices, low-memory devices, and slow network conditions.
- Confirm streaming UI is stable during background/foreground transitions.
- Audit accessibility in web UI (VoiceOver focus order, contrast, text size).
- Add mobile-specific UI tweaks as needed (safe area, keyboard behavior).

Deliverable: polished TestFlight build with QA sign-off.

## Phase 5: Release & CI/CD (2-4 days)

### 1) CI/CD
- Add an iOS build workflow (GitHub Actions or similar).
- Store signing certificates and provisioning profiles securely.
- Automate TestFlight uploads.

### 2) App Store readiness
- Privacy policy and data collection disclosures.
- App Store screenshots and metadata.
- Crash reporting and analytics (optional but recommended).

Deliverable: App Store ready build and release pipeline.

## Architectural Notes

### Backend compatibility checklist
- CORS allows Capacitor origin(s).
- File upload endpoints accept mobile user agents.
- Streaming endpoints handle background and reconnects.
- Rate limiting and auth token refresh are mobile-friendly.

### Client compatibility checklist
- Ensure Vite build has deterministic base path.
- Avoid browser-only APIs unsupported in WKWebView.
- Handle keyboard and viewport resizing in iOS.

## Risks and Mitigations
- SSE reliability: add reconnect logic and fallbacks.
- Auth in WKWebView: move to token-based auth if cookies are inconsistent.
- App Store review: ensure no prohibited content and proper moderation policies.

## Implementation Checklist
- [ ] Choose framework and confirm constraints.
- [ ] Add Capacitor and create iOS project.
- [ ] Build and load web UI in simulator.
- [ ] Implement auth + secure storage.
- [ ] Validate SSE streaming.
- [ ] Add native plugins (if needed).
- [ ] QA on real devices.
- [ ] Set up CI/CD and TestFlight.
- [ ] Prepare App Store assets.

## Optional: React Native Rewrite Scope (if needed)
- Rebuild chat UI in React Native.
- Re-implement SSE streaming with native networking.
- Port shared logic from `packages/` into RN-compatible modules.

## Ownership and Milestones
- Product: requirements and release criteria.
- Web: React app parity and mobile UX adjustments.
- Backend: auth, streaming stability, and push endpoints.
- Mobile: native shell, plugins, and App Store pipeline.
