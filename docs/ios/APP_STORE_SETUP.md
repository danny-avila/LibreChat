# CodeCan AI — App Store Connect Setup Guide

End-to-end checklist to take CodeCan AI from a local Capacitor build to a
TestFlight upload. Covers Apple Developer Portal, App Store Connect,
Sign in with Apple, In-App Purchases, and the RevenueCat dashboard.

Companion to:

- [`docs/REVENUECAT_SETUP.md`](../REVENUECAT_SETUP.md) — RevenueCat env vars + entitlement contract
- [`docs/REVENUECAT_ARCHITECTURE.md`](../REVENUECAT_ARCHITECTURE.md) — how purchases flow through the app
- [`docs/ios/DEVELOPER_PLAN.md`](DEVELOPER_PLAN.md) — local iOS build flow

Reference values used throughout this guide:

| Thing                       | Value                  |
| --------------------------- | ---------------------- |
| Bundle ID                   | `ai.codecan.app`       |
| RevenueCat entitlement      | `codecan_ai_pro`       |
| Native auth callback path   | `/oauth/apple/callback`|

Before starting, complete these merges so the iOS project actually
matches what this guide assumes:

- [PR #4](https://github.com/noblezilla/LibreChat/pull/4) — sanitize `.env.example`
- [PR #5](https://github.com/noblezilla/LibreChat/pull/5) — bundle ID + Info.plist + privacy manifest + RevenueCat pod
- [PR #6](https://github.com/noblezilla/LibreChat/pull/6) — full app icon set

After merging PR #5, on a Mac:

```bash
cd ios/App && pod install
git add Podfile.lock && git commit -m "ios: regenerate Podfile.lock with RevenueCat"
```

---

## Prerequisites

Items that must already be in place before you start. Stop now if any
are missing — most steps below depend on them.

- **Apple Developer Program enrollment** ($99/year). Individual or
  Organization both work; Organization unlocks team roles. Enroll at
  <https://developer.apple.com/programs/enroll/>. Approval takes
  hours-to-days.
- **Mac with Xcode** (latest stable). Required to archive and upload
  builds. Xcode → Settings → Accounts → add your Apple ID.
- **RevenueCat account** (free tier OK to start) at
  <https://app.revenuecat.com>.
- **Production backend reachable over HTTPS.** The mobile app cannot
  ship pointing at `localhost`. Have a domain + TLS cert sorted before
  the TestFlight upload step.
- **A bank account, tax forms, and signed Paid Apps Agreement** in App
  Store Connect → Business → Agreements, Tax, and Banking. Apple
  blocks IAP product creation until these are complete. Start this
  early — tax verification can take a week.

---

## Part 1 — Apple Developer Portal

<https://developer.apple.com/account>

### 1.1 Register the App ID

1. Sidebar → **Identifiers** → `+` button.
2. Select **App IDs** → **App** → Continue.
3. Description: `CodeCan AI`. Bundle ID: **Explicit** = `ai.codecan.app`.
4. Under **Capabilities**, tick at minimum:
   - **Sign in with Apple** (we'll configure the Service ID in 1.3)
   - **In-App Purchase**
   - **Push Notifications** (only if you plan to send pushes — skip for v1)
   - **Associated Domains** (only if you plan to use Universal Links — skip for v1)
5. Continue → Register.

### 1.2 Generate an iOS Distribution certificate

If you don't already have one:

1. **Certificates** → `+` → **Apple Distribution** → Continue.
2. Follow the CSR flow (Keychain Access → Certificate Assistant →
   Request a Certificate from a Certificate Authority, save to disk,
   upload the `.certSigningRequest` file).
3. Download the `.cer`, double-click to install in Keychain.

Xcode will normally manage signing automatically once the App ID
exists and you sign into your Apple ID under Xcode → Settings →
Accounts.

### 1.3 Sign in with Apple — register a Services ID

You need this even though the app uses Apple Sign-In natively, because
the LibreChat backend uses the OAuth flow (it expects a client_id +
private key to validate the JWT).

1. **Identifiers** → filter by **Services IDs** → `+`.
2. Description: `CodeCan AI Sign-In`. Identifier: `ai.codecan.app.signin`
   (must differ from the App ID).
3. Tick **Sign in with Apple** → **Configure**:
   - **Primary App ID**: `ai.codecan.app`
   - **Domains and Subdomains**: your production backend domain
     (e.g. `api.codecan.ai`). No `https://`, no path.
   - **Return URLs**: full callback URL,
     e.g. `https://api.codecan.ai/oauth/apple/callback`
4. Save → Continue → Register.

### 1.4 Sign in with Apple — generate the private key (.p8)

1. **Keys** → `+`.
2. Key Name: `CodeCan AI Sign-In Key`.
3. Tick **Sign in with Apple** → **Configure** → select Primary App ID
   `ai.codecan.app`.
4. Continue → Register → **Download** the `.p8` file. **You can only
   download it once.** Store it somewhere safe (1Password, vault).
5. Note the **Key ID** shown on the page (10-char string like
   `ABC123DEFG`). You'll need it.
6. Note your **Team ID** — top-right corner of the developer portal,
   under your name. 10-char string.

You now have everything needed to populate these env vars (see Part 5):

```dotenv
APPLE_CLIENT_ID=ai.codecan.app.signin
APPLE_TEAM_ID=<your 10-char team ID>
APPLE_KEY_ID=<the 10-char Key ID from step 5>
APPLE_CALLBACK_URL=/oauth/apple/callback

# Provide ONE of the two below, depending on where you're deploying:
APPLE_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_<keyid>.p8   # local dev, VPS, Render Secret Files
APPLE_PRIVATE_KEY=                                            # DO App Platform, Heroku — paste full .p8 contents
```

**Never commit the `.p8` file or its contents to git.** It's a private
signing key — anyone who has it can mint Apple ID tokens your backend
will accept. Keep it in a secret manager, an encrypted vault, or
behind your hosting provider's "Encrypted env var" flag.

---

## Part 2 — App Store Connect: Create the app

<https://appstoreconnect.apple.com>

### 2.1 Create the app record

1. **My Apps** → `+` → **New App**.
2. Fill in:
   - **Platform**: iOS
   - **Name**: `CodeCan AI` (this is what shows in the App Store)
   - **Primary Language**: English (or your default)
   - **Bundle ID**: select `ai.codecan.app` from the dropdown (it
     appears because you registered it in 1.1)
   - **SKU**: any internal identifier, e.g. `codecan-ios-001`
   - **User Access**: Full Access unless you're managing multi-team
     permissions
3. Create.

### 2.2 Fill in App Information (one-time)

Under **App Information** in the sidebar:

- **Subtitle** (optional, 30 chars)
- **Category**: Productivity (recommended) or Business
- **Content Rights**: declare whether the app contains, shows, or
  accesses third-party content
- **Age Rating**: complete the questionnaire
- **Privacy Policy URL** — required for any app that collects user
  data. Must be a real URL hosted by you.

### 2.3 Complete Agreements, Tax, and Banking

**Business** → Agreements, Tax, and Banking. Sign the Paid Apps
Agreement, fill in your bank info and tax forms. **In-App Purchase
products will not save until this is done.** Plan for delays —
W-9/W-8BEN review can take days.

---

## Part 3 — In-App Purchases in App Store Connect

You must create the products here **before** RevenueCat can sell them.

### 3.1 Decide your product matrix

The codebase expects an entitlement called `codecan_ai_pro` (see
[`SubscriptionContext.tsx:65`](../../client/src/hooks/Subscription/SubscriptionContext.tsx) and
[`docs/REVENUECAT_SETUP.md`](../REVENUECAT_SETUP.md)). Typical setup:

| App Store product ID            | Type                  | Duration |
| ------------------------------- | --------------------- | -------- |
| `codecan_ai_pro_monthly`        | Auto-Renewable Sub    | 1 month  |
| `codecan_ai_pro_yearly`         | Auto-Renewable Sub    | 1 year   |

Pick whatever IDs you want, but be consistent — the same IDs go into
RevenueCat in Part 4.

### 3.2 Create a Subscription Group

Auto-renewable subscriptions belong to a **Subscription Group**. Users
can only have one active subscription per group; this is also how
upgrade/downgrade/crossgrade pricing works.

1. **App** → sidebar → **Subscriptions** → `+` next to Subscription
   Groups.
2. Reference Name: `CodeCan AI Pro` (internal only).
3. Create. Add a localization (group display name shown in the App
   Store, e.g. `CodeCan AI Pro`).

### 3.3 Create each subscription product

Inside the group, click **Create** for each plan:

For `codecan_ai_pro_monthly`:

1. **Reference Name**: `Pro Monthly` (internal)
2. **Product ID**: `codecan_ai_pro_monthly` (cannot be changed later)
3. Create → on the product page, fill in:
   - **Subscription Duration**: 1 Month
   - **Subscription Prices**: pick a price tier (e.g. $9.99 USD); App
     Store auto-converts to other currencies
   - **Localizations**: **Display Name** and **Description** (shown on
     the App Store and the system payment sheet). Required for each
     supported language.
   - **Review Information**:
     - Screenshot of your paywall (1024×1024+ accepted)
     - Review notes if anything is non-obvious
4. Save. Status will be **Ready to Submit** once everything is filled.

Repeat for `codecan_ai_pro_yearly` (Duration: 1 Year, e.g. $79.99/yr).

### 3.4 Optional: Introductory Offers / Free Trials

Per product → **Subscription Prices** → `+` → **Create Introductory
Offer** → choose Free Trial / Pay As You Go / Pay Up Front. Standard
free trial: 7 days.

### 3.5 Sandbox testers

To test purchases before submission:

1. **Users and Access** → **Sandbox** → **Testers** → `+`.
2. Create a fake email (e.g. `tester+codecan@yourdomain.com` — must be
   one Apple has not seen). Set a password.
3. On your test device: Settings → App Store → Sandbox Account →
   sign in with this tester. **Do not** sign in with a sandbox tester
   in the main Apple ID slot — only in the sandbox slot.
4. Sandbox purchases are free and renew accelerated (1 month = 5
   minutes, 1 year = 1 hour).

---

## Part 4 — RevenueCat dashboard

<https://app.revenuecat.com>

### 4.1 Create a Project (production)

If you only have the sandbox project right now, create a separate
**production** project. Sandbox keys (`test_…` SDK keys, `rcb_sb_…`
secret) won't work for real App Store purchases.

1. Top-left project switcher → **Create new project**.
2. Name: `CodeCan AI Production`.

### 4.2 Add the iOS app to the project

1. Project Settings → **Apps** → `+ New` → **App Store**.
2. Bundle ID: `ai.codecan.app`.
3. **App Store Connect API key** (recommended, enables server-side
   subscription validation):
   - In App Store Connect: Users and Access → Integrations → App Store
     Connect API → `+` to generate a key. Role: **App Manager** or
     **Admin**. Download the `.p8` (one-time download).
   - In RevenueCat: paste the Key ID, Issuer ID, and upload the `.p8`.
4. **Shared Secret** (legacy, also still useful): App Store Connect →
   App → App Information → App-Specific Shared Secret → Generate.
   Paste into RevenueCat.

### 4.3 Create the Entitlement

Project → **Entitlements** → `+ New`.

- **Identifier**: `codecan_ai_pro` (must match exactly — the client
  hardcodes this string at
  [`SubscriptionContext.tsx:65`](../../client/src/hooks/Subscription/SubscriptionContext.tsx))
- **Display Name**: `CodeCan AI Pro`

### 4.4 Create Products

Project → **Products** → `+ New`. For each App Store product ID
created in 3.3:

1. **App Store** → select your iOS app.
2. **Identifier**: `codecan_ai_pro_monthly` (must match the App Store
   Product ID exactly).
3. Attach to the `codecan_ai_pro` entitlement.

Repeat for `codecan_ai_pro_yearly`.

### 4.5 Create an Offering

**Offerings** → `+ New`.

- **Identifier**: `default` (or whatever the client requests; check
  `client/src/hooks/Subscription/` for the exact string the app reads).
- **Display Name**: `CodeCan AI Pro`.
- Attach both products. Mark one as `$rc_monthly`, the other as
  `$rc_annual`. Set one offering as **Current**.

### 4.6 Web Purchase Link (for browser users)

Project → **Web Billing** (or **Stripe** integration if you went that
route) → create a hosted purchase link for the same offering.

Format the URL with `{APP_USER_ID}` so the backend can substitute the
signed-in user ID:

```
https://pay.rev.cat/<your-token>/{APP_USER_ID}
```

This goes into `REVENUECAT_WEB_PURCHASE_LINK_URL` (see Part 5).

### 4.7 Webhook (optional but recommended)

Project Settings → **Integrations** → **Webhooks** → `+ Add`.

- URL: `https://<your-backend>/api/webhooks/revenuecat`
- Authorization Header: any random string (e.g.
  `openssl rand -hex 32`). Save it as `REVENUECAT_WEBHOOK_AUTH` in
  your backend env. The backend checks for it on every webhook.

### 4.8 Grab your production keys

Project Settings → **API Keys**:

- **Public SDK Key (Apple App Store)** — starts with `appl_…`. This
  is `REVENUECAT_PUBLIC_SDK_KEY_IOS`.
- **Public SDK Key (Google Play)** — starts with `goog_…`. This is
  `REVENUECAT_PUBLIC_SDK_KEY_ANDROID`.
- **Secret API Key (REST)** — starts with `sk_…` (production) or
  `rcb_…` (sandbox). Production goes into `REVENUECAT_SECRET_API_KEY`.

The previously committed `test_nAQUobeChFPDopsVgbLsDWlcNlN` and
`rcb_sb_aQeILzRqIzKlcRPgEZoqpNrTU` are sandbox values and **must not**
be used in production builds.

---

## Part 5 — Wire the env vars

### 5.1 File layout

The repo's `.gitignore` covers `.env*` except `.env.example`. Use:

- **`.env`** — local development (your sandbox keys, `localhost` URLs)
- **`.env.production`** — values used when building for TestFlight /
  App Store

Both are gitignored. Only commit `.env.example` (the template).

### 5.2 Production `.env.production` checklist

Copy `.env.example` to `.env.production` and fill in:

```dotenv
# --- Backend identity ---
DOMAIN_CLIENT=https://app.codecan.ai          # your prod domain
DOMAIN_SERVER=https://api.codecan.ai          # your prod backend
VITE_API_BASE_URL=https://api.codecan.ai      # consumed by ios-build.js

# --- Crypto / sessions (generate fresh — DO NOT reuse local values) ---
CREDS_KEY=<openssl rand -hex 32>
CREDS_IV=<openssl rand -hex 16>
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
MEILI_MASTER_KEY=<must match the prod Meilisearch instance>

# --- App identity ---
APP_TITLE=CodeCan AI

# --- OpenAI / providers (production keys) ---
OPENAI_API_KEY=sk-proj-<rotated production key>

# --- Sign in with Apple (from Part 1) ---
APPLE_CLIENT_ID=ai.codecan.app.signin
APPLE_TEAM_ID=<10-char Team ID>
APPLE_KEY_ID=<10-char Key ID>
APPLE_CALLBACK_URL=/oauth/apple/callback
# Pick ONE of the two below — see Part 5.5 for which to use on which host:
APPLE_PRIVATE_KEY_PATH=/var/secrets/AuthKey_<keyid>.p8
# APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# --- Google OAuth (rotated production secret) ---
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<rotated production secret>
GOOGLE_CALLBACK_URL=/oauth/google/callback

# --- RevenueCat (production keys from Part 4.8) ---
REVENUECAT_ENTITLEMENT_ID=codecan_ai_pro
REVENUECAT_FREE_MESSAGES_PER_MONTH=3
REVENUECAT_SECRET_API_KEY=sk_<production secret>
REVENUECAT_WEBHOOK_AUTH=<random string from Part 4.7>
REVENUECAT_WEB_PURCHASE_LINK_URL=https://pay.rev.cat/<token>/{APP_USER_ID}
REVENUECAT_PUBLIC_SDK_KEY_IOS=appl_<production iOS key>
REVENUECAT_PUBLIC_SDK_KEY_ANDROID=goog_<production Android key>

# --- Mailgun (rotated production key) ---
MAILGUN_API_KEY=<rotated production key>
EMAIL_FROM=noreply@codecan.ai
```

### 5.3 Loading `.env.production` for the iOS build

The iOS build script ([`utils/ios-build.js`](../../utils/ios-build.js))
reads `.env` directly to find `LIBRECHAT_API_URL`, but takes
`VITE_API_BASE_URL` from the process environment. The simplest pattern:

```bash
set -a
source .env.production
set +a
npm run ios:build
```

Or inline:

```bash
env $(grep -v '^#' .env.production | xargs) npm run ios:build
```

Verify the build is using prod values — the script logs
`iOS build using API base: <url>` near the start.

### 5.4 Backend deployment

The same `.env.production` (minus the `VITE_…` and `REVENUECAT_PUBLIC_…`
keys, which are client-side) belongs in your backend host's secret
manager (Render env vars, Fly secrets, AWS Secrets Manager, etc.). The
public `appl_…` / `goog_…` keys are safe to expose to the client; the
`sk_…` secret key is **not** and must only live on the backend.

### 5.5 Where the Apple `.p8` private key lives in production

The `.p8` is a private signing key — treat it like an SSH private key.
**Never commit it to git.** The auth strategy
([`api/strategies/appleStrategy.js`](../../api/strategies/appleStrategy.js))
accepts the key two ways and you should pick one based on your host:

| Host                              | Use                       |
| --------------------------------- | ------------------------- |
| Local development                 | `APPLE_PRIVATE_KEY_PATH`  |
| DigitalOcean Droplet (SSH access) | `APPLE_PRIVATE_KEY_PATH`  |
| DigitalOcean App Platform         | `APPLE_PRIVATE_KEY`       |
| Render (with Secret Files)        | `APPLE_PRIVATE_KEY_PATH`  |
| Heroku                            | `APPLE_PRIVATE_KEY`       |
| Fly.io                            | either (secrets work both as files and env vars) |
| AWS ECS / Fargate                 | `APPLE_PRIVATE_KEY_PATH` (mount via Secrets Manager) |

If both env vars are set, `APPLE_PRIVATE_KEY` (contents) wins.

#### Path form (`APPLE_PRIVATE_KEY_PATH`)

For local dev, copy the `.p8` to a directory outside the repo:

```bash
mkdir -p ~/.secrets/codecan
mv ~/Downloads/AuthKey_ABC123DEFG.p8 ~/.secrets/codecan/
chmod 600 ~/.secrets/codecan/AuthKey_ABC123DEFG.p8
```

Then in your local `.env`:

```dotenv
APPLE_PRIVATE_KEY_PATH=/Users/<you>/.secrets/codecan/AuthKey_ABC123DEFG.p8
```

For a Droplet, `scp` it up and chmod 600.

#### Inline form (`APPLE_PRIVATE_KEY`) — DigitalOcean App Platform

1. In the DO control panel, go to your App → **Settings** → **App-Level
   Environment Variables** → **Edit**.
2. Add a variable named `APPLE_PRIVATE_KEY`.
3. Paste the **full** `.p8` file contents into the value field — copy
   everything from `-----BEGIN PRIVATE KEY-----` through
   `-----END PRIVATE KEY-----` inclusive, newlines and all. DO accepts
   multi-line values.
4. **Tick the lock icon** to mark it as Encrypted. (Encrypted values
   are not displayed back to admins after saving.)
5. Save → DO redeploys.
6. Make sure `APPLE_PRIVATE_KEY_PATH` is **not** set on this host (or
   leave it blank). The contents form takes precedence when both are
   present, but it's cleaner to only define the one you're using.

The strategy normalizes literal `\n` escape sequences to real newlines
before signing, so if DO ever returns the value with the escape intact
(depends on how it was entered), it still works.

#### Backend code path

The strategy at runtime uses whichever you set:

```js
// api/strategies/appleStrategy.js
if (process.env.APPLE_PRIVATE_KEY) {
  options.privateKeyString = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');
} else if (process.env.APPLE_PRIVATE_KEY_PATH) {
  options.privateKeyLocation = process.env.APPLE_PRIVATE_KEY_PATH;
}
```

If you ever rotate the key (revoke + regenerate at developer.apple.com
→ Keys), update the env var on every environment that has it.

---

## Part 6 — Build, archive, upload to TestFlight

### 6.1 Build the web bundle for production

```bash
set -a; source .env.production; set +a
npm run ios:build
```

This runs the Capacitor sync and copies the production-built web
assets into the iOS project.

### 6.2 Open Xcode

```bash
open ios/App/App.xcworkspace
```

(Always open the `.xcworkspace`, never the `.xcodeproj` — pods won't
link otherwise.)

### 6.3 Configure signing

1. Select the **App** target → **Signing & Capabilities**.
2. **Team**: pick your Apple Developer team.
3. Tick **Automatically manage signing**.
4. Bundle Identifier: should already be `ai.codecan.app` (from PR #5).
5. Capabilities — verify these match what you ticked in Part 1.1:
   - Sign in with Apple
   - In-App Purchase
   - (Push Notifications, Associated Domains if applicable)

If a red error appears, click **Try Again** — Xcode will fetch a
provisioning profile.

### 6.4 Verify the privacy manifest is bundled

1. App target → **Build Phases** → **Copy Bundle Resources**.
2. Confirm `PrivacyInfo.xcprivacy` is in the list. (PR #5 wires it
   automatically; this is just a sanity check.)

### 6.5 Bump version / build number

1. App target → **General** → **Identity**.
2. **Version**: user-facing semver, e.g. `1.0.0`.
3. **Build**: monotonically increasing, e.g. `1`. Increment for every
   TestFlight upload.

### 6.6 Archive

1. Top of Xcode: scheme = **App**, destination = **Any iOS Device
   (arm64)**. (Not a simulator — archives require a real-device
   destination.)
2. **Product** → **Archive**. Takes 2–10 min.
3. The Organizer window opens when done.

### 6.7 Upload

1. In the Organizer, select the new archive → **Distribute App**.
2. **App Store Connect** → **Upload** → Next through the defaults.
3. Choose **Automatically manage signing** when prompted.
4. Click Upload. Takes a few minutes.

### 6.8 TestFlight processing

1. App Store Connect → your app → **TestFlight** tab.
2. The build appears with status **Processing** (5–30 min).
3. Once processed, it asks: *Does this app use encryption?* If you
   set `ITSAppUsesNonExemptEncryption=false` (PR #5 did), this is
   handled silently. If not, answer **No** — using HTTPS / standard
   Apple APIs qualifies for the exemption.
4. Add internal testers (App Store Connect users on your team) →
   send invites. They install the TestFlight app on their iPhone, get
   the build immediately.
5. External testers require a Beta App Review (~24h, lighter than
   full App Review).

### 6.9 First production submission

When you're ready for the live App Store:

1. App Store Connect → **App Store** tab → version `1.0`.
2. Fill in: screenshots (6.5"/6.7" iPhone required, 12.9" iPad if
   universal), description, keywords, support URL, marketing URL.
3. Build: select the TestFlight build to submit.
4. **App Review Information**: provide a demo account login (App
   Review will not sign up — they sign in with whatever you give them).
   For an app with paid tiers, give them a pre-paid Pro account so
   they can exercise the full feature set.
5. **Submit for Review**. Initial review averages 24–72h.

---

## Common pitfalls

- **Bundle ID mismatch**: the bundle ID in Xcode, in
  `capacitor.config.ts`, in the App Store Connect record, and in
  RevenueCat's iOS app settings must be byte-for-byte identical.
- **Forgot to sign Paid Apps Agreement**: IAP products will appear to
  save but won't actually be purchasable — sandbox returns
  "Cannot connect to iTunes Store". Check Agreements, Tax, Banking.
- **Sandbox tester signed into main Apple ID slot**: they'll see real
  prices and a real charge prompt. Always sign sandbox testers into
  Settings → App Store → **Sandbox Account** only.
- **`{APP_USER_ID}` not substituted in web purchase link**: the
  backend only substitutes if the placeholder is exactly
  `{APP_USER_ID}` or `{{APP_USER_ID}}`. URL-encoded versions don't
  match.
- **Sign in with Apple "invalid_client" at runtime**: usually means
  the Service ID's Return URL doesn't exactly match the app's
  configured `APPLE_CALLBACK_URL`. Trailing slashes matter.
- **Privacy manifest rejection**: if App Review flags missing data
  type disclosures, edit
  [`ios/App/App/PrivacyInfo.xcprivacy`](../../ios/App/App/PrivacyInfo.xcprivacy)
  and add the required `NSPrivacyCollectedDataType*` entries.
- **TestFlight build stuck "Processing" for hours**: usually a missing
  required asset (icon size, launch screen) or an entitlement that
  doesn't match the App ID's capabilities. Check email for an Apple
  notice; it usually shows up within 30 min.
- **Screenshots wrong size**: Apple requires exact pixel dimensions
  per device class. Use Xcode's screenshot tool from a simulator at
  the right device, or an asset generator like AppLaunchPad.

---

## Quick reference: who owns what

| System              | Owns                                                             |
| ------------------- | ---------------------------------------------------------------- |
| Apple Developer     | App ID, certificates, provisioning, Sign in with Apple Service + Key |
| App Store Connect   | App record, IAP products, TestFlight, App Store metadata, Tax/Banking |
| RevenueCat          | Entitlement, offering, products mapping, paywall config, webhook |
| Your backend env    | Apple `.p8` key path, RevenueCat secret key, JWT/CREDS keys      |
| Your client env     | RevenueCat public SDK keys, `VITE_API_BASE_URL`                  |
