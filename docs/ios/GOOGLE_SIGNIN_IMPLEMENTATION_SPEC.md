# Google Sign-In on iOS: Implementation Spec

## Objective

Implement Google sign-in for the Capacitor iOS app using `@capacitor-community/generic-oauth2`, while keeping the LibreChat backend as the source of truth for:

- user creation,
- local-to-google provider migration,
- allowed domain enforcement,
- LibreChat token/session issuance.

This spec replaces the earlier browser/deep-link/code-exchange plan. The chosen direction is native OAuth in the app, followed by backend token verification and LibreChat auth exchange.

## Decision

### Chosen approach

Use `@capacitor-community/generic-oauth2` in the iOS app to complete the Google OAuth flow natively, then send the Google identity token to a new backend endpoint that logs the user into LibreChat.

### Why this approach

- avoids embedded-webview OAuth,
- gives a more native iOS login UX,
- avoids sending long-lived LibreChat tokens through a redirect URL,
- preserves the current backend account logic,
- allows mobile auth to diverge from the web cookie flow cleanly.

### Explicit non-goal

Do not try to reuse the existing web `/oauth/google` redirect route from the iOS app.

The web flow stays in place for web. Mobile gets its own Google login path.

## Current Repo State

### Existing web Google auth

- Strategy: `api/strategies/googleStrategy.js`
- Social account handling: `api/strategies/socialLogin.js`
- OAuth routes: `api/server/routes/oauth.js`
- Social login UI: `client/src/components/Auth/SocialButton.tsx`
- Startup config flags: `api/server/routes/config.js`

Current web behavior:

1. Browser navigates to `/oauth/google`
2. Passport completes Google OAuth on the backend
3. Backend sets web refresh cookies
4. Frontend restores auth with `/api/auth/refresh`

### Existing iOS shell

- Capacitor config: `capacitor.config.ts`
- iOS app delegate: `ios/App/App/AppDelegate.swift`
- iOS plist: `ios/App/App/Info.plist`

### Current native/mobile auth gaps

- no `generic-oauth2` plugin installed,
- no iOS redirect scheme configured for native OAuth,
- no backend endpoint for accepting mobile Google identity,
- no mobile auth bootstrap path in `AuthContext`,
- no secure mobile token storage.

## Product Requirements

### User experience

- The login screen continues to show `Continue with Google`.
- On iOS, tapping Google uses native OAuth, not web redirect navigation.
- The user returns directly to the app after Google auth.
- Success lands the user in the intended route with no extra browser cleanup screen.
- Cancel, timeout, and provider mismatch are surfaced with explicit messages.

### Security

- Backend must verify Google identity server-side.
- Do not trust profile fields passed by the client without token verification.
- Do not expose LibreChat refresh tokens in a redirect URL.
- Store mobile auth state in secure native storage.

## OAuth Model

### Mobile OAuth flow

1. User taps `Continue with Google` in the iOS app.
2. App calls `GenericOAuth2.authenticate(...)`.
3. Google returns an auth code to the app redirect scheme.
4. Plugin completes token exchange with Google.
5. App receives Google token payload.
6. App posts Google token data to LibreChat backend.
7. Backend verifies Google identity and signs the user into LibreChat.
8. Backend returns LibreChat auth payload.
9. App stores mobile auth state and routes the user into the app.

### Backend auth flow

Backend should verify the Google token, then reuse the same account rules as the web Google login path:

- existing Google user: sign in,
- existing local user with verified Google email: migrate to Google and sign in,
- existing user under another provider: reject,
- new user: create only if social registration is allowed.

## Google Cloud Requirements

This implementation requires a separate iOS OAuth client in Google Cloud.

### Existing web credentials

Keep these for web:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

### New iOS credentials

Create an iOS OAuth client in Google Cloud and use its iOS client ID in the app.

Suggested env additions:

```env
GOOGLE_IOS_CLIENT_ID=
GOOGLE_IOS_REVERSED_CLIENT_ID=
```

Notes:

- `GOOGLE_IOS_CLIENT_ID` is used by the iOS app/plugin config.
- `GOOGLE_IOS_REVERSED_CLIENT_ID` may be needed for iOS URL scheme alignment depending on final Google client setup.
- These are separate from the web OAuth credentials.

## Dependencies

### Capacitor version

Current repo:

- `@capacitor/core`: `6.2.0`
- `@capacitor/ios`: `6.2.0`

Recommended:

- upgrade to stable Capacitor 7 before implementing this flow.

### Plugin

Install the Capacitor 7-compatible plugin line:

```bash
npm install @capacitor-community/generic-oauth2@7
npx cap sync
```

If implementation begins before the Capacitor upgrade, use the `6.x` plugin line temporarily.

## Concrete Implementation Plan

## Phase 1: Upgrade Capacitor

### Update dependencies

Files:

- `package.json`
- lockfile

Update:

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/ios`
- `@capacitor/keyboard`

Then run:

```bash
npm install
npx cap sync ios
```

### Validate shell still builds

Smoke test:

- app launches on simulator,
- keyboard helper still works,
- no iOS build regressions from the version bump.

## Phase 2: Add plugin and iOS redirect scheme

### Add plugin dependency

Files:

- `package.json`

Add:

```json
"@capacitor-community/generic-oauth2": "^7.x"
```

### Register redirect scheme

File:

- `ios/App/App/Info.plist`

Add `CFBundleURLTypes`.

For example:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>ai.librechat.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>ai.librechat.app</string>
    </array>
  </dict>
</array>
```

### Keep AppDelegate as-is

File:

- `ios/App/App/AppDelegate.swift`

No major changes expected. Capacitor already forwards incoming URLs via `ApplicationDelegateProxy`.

## Phase 3: Add native Google OAuth client code

### Add a dedicated mobile auth helper

Suggested new file:

- `client/src/utils/mobile/googleOAuth.ts`

Responsibilities:

- detect native iOS,
- build `GenericOAuth2` config,
- start authentication,
- normalize Google response for backend exchange.

Suggested shape:

```ts
import { GenericOAuth2 } from '@capacitor-community/generic-oauth2';

export async function authenticateWithGoogleIOS() {
  return await GenericOAuth2.authenticate({
    authorizationBaseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    accessTokenEndpoint: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    responseType: 'code',
    pkceEnabled: true,
    logsEnabled: true,
    ios: {
      appId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID,
      responseType: 'code',
      redirectUrl: 'ai.librechat.app:/oauth2redirect/google',
    },
  });
}
```

Final values should be based on the plugin’s exact Capacitor 7 API and the chosen Google iOS client.

### Add native platform helper

The repo already uses native iOS detection in:

- `client/src/utils/keyboard.ts`

Reuse this pattern for auth behavior rather than inventing a new platform check.

Suggested new helper:

- `client/src/utils/mobile/platform.ts`

Or expand the existing approach into a shared utility.

## Phase 4: Change Google button behavior on iOS

### Current state

File:

- `client/src/components/Auth/SocialButton.tsx`

Current behavior:

- always renders an anchor to `${serverDomain}/oauth/${oauthPath}`

### Required change

On native iOS and only for `google`:

- prevent normal anchor navigation,
- call `authenticateWithGoogleIOS()`,
- send the Google auth result to backend,
- complete LibreChat login in app state.

Web behavior must stay unchanged.

### Suggested structure

Keep the component simple and delegate native login to a hook:

- `client/src/hooks/useNativeGoogleLogin.ts`

Pseudo-flow:

```ts
if (isNativeIOS() && oauthPath === 'google') {
  event.preventDefault();
  await nativeGoogleLogin();
  return;
}
```

### Loading and error UX

On login button press:

- disable repeated taps,
- show loading label like `Opening Google...`

On failures:

- Google canceled: `Sign-in canceled`
- backend exchange failed: `Google sign-in failed`
- provider mismatch: show backend-provided message mapped to UX text

## Phase 5: Add backend mobile Google exchange endpoint

### New endpoint

Add:

```text
POST /api/auth/google/mobile
```

Suggested files:

- `api/server/routes/auth.js`
- `api/server/controllers/auth/GoogleMobileController.js`
- `api/server/services/auth/GoogleMobileService.js`

### Request body

Suggested request:

```json
{
  "idToken": "google-id-token",
  "accessToken": "google-access-token",
  "returnTo": "/c/new"
}
```

The backend should primarily trust and verify `idToken`.

### Backend responsibilities

1. Verify the Google ID token.
2. Extract:
   - `sub`
   - `email`
   - `email_verified`
   - `given_name`
   - `family_name`
   - `name`
   - `picture`
3. Reuse LibreChat social account rules.
4. Issue LibreChat auth payload.
5. Return JSON instead of redirecting.

### Response body

Suggested response:

```json
{
  "token": "librechat-access-token",
  "refreshToken": "librechat-refresh-token",
  "user": {
    "_id": "user-id"
  },
  "redirect": "/c/new"
}
```

### Why JSON response

This is a native app login completion step, not a browser redirect flow.

## Phase 6: Implement backend Google verification

### Verification source

Backend should validate the Google ID token server-side using Google token verification rules.

Do not trust:

- client-supplied email,
- client-supplied profile,
- client-supplied `email_verified`

unless they are derived from a verified Google token.

### Suggested service

Suggested new file:

- `api/server/services/auth/verifyGoogleMobileIdentity.js`

Responsibilities:

- validate token audience against `GOOGLE_IOS_CLIENT_ID`,
- confirm issuer is Google,
- confirm token not expired,
- return normalized Google identity payload.

Normalized shape:

```js
{
  provider: 'google',
  providerId: '<sub>',
  email: 'user@example.com',
  emailVerified: true,
  username: 'GivenName',
  name: 'GivenName FamilyName',
  avatarUrl: 'https://...'
}
```

## Phase 7: Reuse social login account logic

### Current logic

Files:

- `api/strategies/socialLogin.js`
- `api/strategies/process.js`

Current repo behavior now includes:

- existing local user + verified Google email => migrate to Google

That mobile endpoint should reuse the same logic, not fork it.

### Refactor target

Extract the common account resolution path out of Passport strategy wrapper into a reusable service.

Suggested new file:

- `api/server/services/auth/resolveGoogleLogin.js`

Responsibilities:

- accept normalized Google identity data,
- run current domain checks,
- find existing user,
- migrate local user if eligible,
- create social user if allowed,
- reject conflicting providers.

Then:

- `api/strategies/socialLogin.js` can call it
- `GoogleMobileController` can call it

This avoids duplicating provider migration logic between web and mobile.

## Phase 8: Add mobile auth persistence

### Current problem

Current auth state is web-first:

- refresh token is set in `httpOnly` cookie,
- frontend restores auth via `/api/auth/refresh`

This is not enough for native login with `generic-oauth2`.

### Required change

Add a mobile auth persistence path.

Suggested additions:

- secure native storage for refresh token
- in-memory access token
- auth bootstrap path in `AuthContext`

### Suggested storage plugin

Use secure native storage, not `localStorage`.

Suggested new integration point:

- `client/src/utils/mobile/authStorage.ts`

Responsibilities:

- save `refreshToken`
- read `refreshToken`
- clear auth data on logout

### AuthContext changes

File:

- `client/src/hooks/AuthContext.tsx`

Required behavior:

1. On native iOS app startup, check secure storage first.
2. If mobile refresh token exists, call a mobile refresh endpoint or reuse an adapted refresh path.
3. If no mobile auth state exists, fall back to logged-out state.
4. Preserve current web behavior for browsers.

## Phase 9: Add logout behavior for mobile

### Current logout

Current logout is web-cookie oriented.

### Required mobile behavior

On native logout:

- clear secure storage,
- clear in-memory token,
- optionally call backend logout endpoint to revoke server session.

Do not rely only on cookie clearing.

## Concrete File-Level Changes

### Frontend

Update:

- `client/src/components/Auth/SocialButton.tsx`
- `client/src/hooks/AuthContext.tsx`
- `client/src/routes/index.tsx` if auth bootstrap wiring is needed

Add:

- `client/src/utils/mobile/googleOAuth.ts`
- `client/src/hooks/useNativeGoogleLogin.ts`
- `client/src/utils/mobile/authStorage.ts`
- `client/src/utils/mobile/platform.ts`

### iOS

Update:

- `ios/App/App/Info.plist`

### Backend

Update:

- `api/server/routes/auth.js`
- optionally `api/strategies/socialLogin.js`

Add:

- `api/server/controllers/auth/GoogleMobileController.js`
- `api/server/services/auth/GoogleMobileService.js`
- `api/server/services/auth/verifyGoogleMobileIdentity.js`
- `api/server/services/auth/resolveGoogleLogin.js`

## API Contract

### Mobile Google login

Request:

```http
POST /api/auth/google/mobile
Content-Type: application/json
```

```json
{
  "idToken": "google-id-token",
  "accessToken": "google-access-token",
  "returnTo": "/c/new"
}
```

Success:

```json
{
  "token": "jwt",
  "refreshToken": "refresh-token",
  "user": {
    "_id": "user-id",
    "email": "user@example.com",
    "provider": "google"
  },
  "redirect": "/c/new"
}
```

Failure cases:

- `400` invalid request body
- `401` invalid Google token
- `403` email domain not allowed
- `403` social registration disabled
- `409` existing account uses another provider
- `500` internal auth error

## Testing Plan

### Unit tests

Frontend:

- native iOS platform detection
- native Google login success path
- canceled login handling
- backend exchange failure handling

Backend:

- valid Google token verification
- invalid audience rejection
- invalid issuer rejection
- expired token rejection
- existing Google user login
- local user migration to Google
- conflicting non-local provider rejection
- social registration disabled rejection

### Integration tests

- `POST /api/auth/google/mobile` with valid Google token returns LibreChat auth payload
- migrated local user can log in via mobile Google flow
- migrated local user no longer authenticates through local password flow

### Manual QA

On real iPhone:

1. Existing local user signs in with Google and is migrated.
2. Existing Google user signs in again.
3. Brand new Google user signs in.
4. User cancels Google auth.
5. App is backgrounded during OAuth.
6. App is force-closed and reopened.
7. Logout clears mobile auth state.

## Rollout Plan

### Step 1

Upgrade Capacitor to 7 and keep web auth untouched.

### Step 2

Add native iOS Google sign-in behind a platform-specific path only.

### Step 3

Ship backend mobile Google exchange endpoint and secure storage.

### Step 4

QA migration behavior for existing local users.

### Step 5

If stable, generalize the same architecture to Apple sign-in.

## Open Questions

1. Should mobile reuse the existing refresh-session model internally, or introduce a dedicated mobile refresh token flow?
2. Should `returnTo` be supported in v1, or should mobile always land on `/c/new`?
3. Should Google mobile login be feature-flagged initially?
4. Should the Google mobile endpoint issue the same JWT shape as web, or a mobile-specific auth payload contract?

## Recommendation Summary

Use `@capacitor-community/generic-oauth2` for native Google OAuth on iOS, then exchange the verified Google identity with the LibreChat backend through a dedicated mobile login endpoint. Keep the existing web Passport flow for browsers, but refactor the account resolution logic so both web and mobile reuse the same provider rules and local-to-google migration behavior.

## Execution Task List

This is the implementation order. Each task should be completed and validated before moving to the next one.

### Milestone 1: Upgrade Capacitor baseline

1. Update Capacitor dependencies in `package.json`
   - Upgrade `@capacitor/core`
   - Upgrade `@capacitor/cli`
   - Upgrade `@capacitor/ios`
   - Upgrade `@capacitor/keyboard`
2. Reinstall dependencies and sync iOS
   - Run `npm install`
   - Run `npx cap sync ios`
3. Validate iOS app still builds
   - Open Xcode project
   - Confirm simulator build succeeds
   - Confirm existing app launch still works
4. Smoke-test existing native helpers
   - Verify `client/src/utils/keyboard.ts` behavior still works on iOS

Definition of done:

- Capacitor 7 builds locally
- iOS simulator launches the app
- no regression in current shell startup

### Milestone 2: Add native OAuth dependencies and config

1. Install `@capacitor-community/generic-oauth2`
2. Sync native platforms
   - Run `npx cap sync ios`
3. Add iOS URL scheme configuration in `ios/App/App/Info.plist`
4. Add new env variables for mobile Google config
   - `GOOGLE_IOS_CLIENT_ID`
   - `GOOGLE_IOS_REVERSED_CLIENT_ID`
5. Add matching examples/placeholders in `.env.example`

Definition of done:

- plugin is installed
- iOS app contains the required redirect scheme
- repo documents required mobile Google env vars

### Milestone 3: Add frontend mobile auth foundation

1. Add shared native platform helper
   - create `client/src/utils/mobile/platform.ts`
   - expose `isNativeIOS()`
2. Add Google OAuth helper
   - create `client/src/utils/mobile/googleOAuth.ts`
   - configure `GenericOAuth2.authenticate(...)`
3. Add secure auth storage helper
   - create `client/src/utils/mobile/authStorage.ts`
   - define `saveRefreshToken`, `getRefreshToken`, `clearAuthStorage`
4. Add native login hook
   - create `client/src/hooks/useNativeGoogleLogin.ts`
   - own loading/error state for the native Google flow

Definition of done:

- frontend has isolated modules for native platform detection, Google auth, and auth persistence
- no UI behavior changed yet

### Milestone 4: Add backend mobile Google endpoint

1. Add controller
   - create `api/server/controllers/auth/GoogleMobileController.js`
2. Add service for Google token verification
   - create `api/server/services/auth/verifyGoogleMobileIdentity.js`
3. Add service for shared Google account resolution
   - create `api/server/services/auth/resolveGoogleLogin.js`
4. Add service for mobile login orchestration
   - create `api/server/services/auth/GoogleMobileService.js`
5. Wire route into `api/server/routes/auth.js`
   - add `POST /api/auth/google/mobile`
6. Validate request body
   - require `idToken`
   - optionally accept `accessToken`
   - validate `returnTo` as a relative internal path only

Definition of done:

- backend accepts a verified Google mobile login request
- endpoint returns LibreChat auth payload as JSON

### Milestone 5: Refactor shared Google account resolution

1. Extract account resolution logic from `api/strategies/socialLogin.js`
2. Move common flow into `api/server/services/auth/resolveGoogleLogin.js`
3. Make web Passport Google strategy reuse the shared service
4. Make mobile Google endpoint reuse the same shared service

Required behaviors:

- existing Google user logs in
- existing verified local user migrates to Google
- conflicting provider is rejected
- social registration rules are preserved
- allowed-domain checks are preserved

Definition of done:

- web and mobile Google flows share a single account resolution path
- there is no duplicated migration logic

### Milestone 6: Wire iOS Google button into native flow

1. Update `client/src/components/Auth/SocialButton.tsx`
   - intercept iOS native Google login
   - preserve existing anchor behavior for web
2. Connect the component to `useNativeGoogleLogin`
3. Add loading UX
   - disable repeated taps
   - show `Opening Google...`
4. Add error UX
   - cancel
   - provider mismatch
   - invalid Google token
   - backend exchange failure

Definition of done:

- tapping Google on web still uses backend redirect
- tapping Google on iOS uses native OAuth

### Milestone 7: Add mobile auth bootstrap and logout

1. Update `client/src/hooks/AuthContext.tsx`
   - add mobile startup path using secure storage
   - preserve current web refresh-cookie behavior
2. Add token hydration logic for native app startup
3. Add mobile logout cleanup
   - clear secure storage
   - clear in-memory token
   - optionally revoke backend session
4. Ensure route navigation after login uses backend-provided redirect or defaults to `/c/new`

Definition of done:

- app can restart and restore mobile auth state
- logout fully clears mobile auth state

### Milestone 8: Add automated tests

1. Backend unit tests
   - Google token verification
   - invalid audience rejection
   - invalid issuer rejection
   - expired token rejection
   - local-to-google migration
   - conflicting provider rejection
2. Backend integration tests
   - `POST /api/auth/google/mobile` success path
   - migrated local user no longer authenticates as local if applicable
3. Frontend tests
   - iOS native path selection
   - web path preservation
   - loading state
   - exchange failure handling

Definition of done:

- new mobile Google flow is covered by focused automated tests

### Milestone 9: Manual QA

1. Existing local user signs in with Google and migrates
2. Existing Google user signs in with Google
3. Brand new Google user signs in
4. Google login canceled by user
5. Invalid Google client config
6. App backgrounded during OAuth
7. App restarted after login
8. Logout and re-login
9. Verify web Google login still works unchanged

Definition of done:

- iOS flow is reliable on a real device
- web behavior is not regressed

## Suggested PR Breakdown

To reduce risk, split implementation into separate PRs:

1. Capacitor 7 upgrade
2. `generic-oauth2` setup plus iOS scheme wiring
3. Backend `POST /api/auth/google/mobile` endpoint
4. Shared Google account resolution refactor
5. Frontend native iOS Google login wiring
6. Mobile auth persistence and logout
7. Test coverage and cleanup

## Minimal Viable Implementation

If you want the fastest path with acceptable scope, implement only:

1. Capacitor 7 upgrade
2. `generic-oauth2` iOS setup
3. `POST /api/auth/google/mobile`
4. Shared Google account resolution
5. iOS-only Google button interception

Then defer:

- secure refresh persistence refinements
- broader mobile logout hardening
- support for additional social providers
