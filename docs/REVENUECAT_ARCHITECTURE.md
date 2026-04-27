# RevenueCat Subscription Architecture

This document explains how subscriptions work in this app beyond the basic env and dashboard setup described in [REVENUECAT_SETUP.md](/Users/cnoble/Apps/LibreChat/docs/REVENUECAT_SETUP.md).

## Goals

The subscription layer is designed to do four things:

- unlock `CodeCan AI Pro` consistently on web and native
- support RevenueCat-hosted checkout on web
- support RevenueCat paywalls and Customer Center on native
- enforce free-tier message quotas on the backend, not the client

## Source of truth

RevenueCat is the source of truth for paid entitlement state.

This app does not trust the frontend alone for Pro access. Instead:

1. RevenueCat stores the canonical customer/subscriber state.
2. The backend syncs and normalizes that state into Mongo.
3. The backend uses the normalized state to decide whether the user is Pro.
4. The backend enforces quotas before model execution begins.

## Main components

### Backend sync layer

File: [api/server/services/Billing/RevenueCatService.js](/Users/cnoble/Apps/LibreChat/api/server/services/Billing/RevenueCatService.js)

Responsibilities:

- read RevenueCat-related env vars
- fetch subscriber/customer state from RevenueCat
- normalize RevenueCat entitlements into app-specific fields
- store the cached result in `SubscriptionProfile`
- build hosted web checkout URLs
- handle webhook-triggered refreshes

Important outputs:

- `getSubscriptionPublicConfig()`
- `getSubscriptionProfile()`
- `getCheckoutLinkForUser()`
- `handleWebhookEvent()`

### Subscription cache model

Files:

- [packages/data-schemas/src/schema/subscriptionProfile.ts](/Users/cnoble/Apps/LibreChat/packages/data-schemas/src/schema/subscriptionProfile.ts)
- [packages/data-schemas/src/models/subscriptionProfile.ts](/Users/cnoble/Apps/LibreChat/packages/data-schemas/src/models/subscriptionProfile.ts)

`SubscriptionProfile` is the app’s cached subscription record for a user.

It stores:

- `userId`
- `appUserId`
- `entitlementId`
- `isPro`
- `currentPlan`
- `productId`
- `store`
- `expiresAt`
- `managementUrl`
- `entitlements`
- `quota`
- `lastSyncedAt`

The important part is that the same document holds both:

- normalized RevenueCat entitlement state
- monthly free-usage quota state

That makes enforcement atomic and avoids having billing state split across multiple collections.

### Subscription API

File: [api/server/routes/subscription.js](/Users/cnoble/Apps/LibreChat/api/server/routes/subscription.js)

Routes:

- `GET /api/subscription/me`
- `POST /api/subscription/refresh`
- `POST /api/subscription/checkout-link`

What each route does:

- `/me` returns the current cached subscription state, refreshing only if needed by existing service behavior
- `/refresh` forces a RevenueCat sync
- `/checkout-link` returns a RevenueCat-hosted web checkout URL for the signed-in user

### RevenueCat webhook endpoint

File: [api/server/routes/revenuecat.js](/Users/cnoble/Apps/LibreChat/api/server/routes/revenuecat.js)

Route:

- `POST /api/webhooks/revenuecat`

Purpose:

- receive RevenueCat lifecycle events
- locate the matching local user via `app_user_id` / aliases
- trigger a canonical refresh from RevenueCat rather than trusting partial webhook payloads

This is intentionally conservative. The app re-fetches the customer from RevenueCat instead of trying to reconstruct entitlement transitions from event payloads alone.

### Quota enforcement layer

Files:

- [api/server/services/Billing/quota.js](/Users/cnoble/Apps/LibreChat/api/server/services/Billing/quota.js)
- [api/server/middleware/subscriptionQuota.js](/Users/cnoble/Apps/LibreChat/api/server/middleware/subscriptionQuota.js)

This is where the free tier is actually enforced.

The client may show remaining messages, but the backend decides whether a request is allowed.

### Native subscription lifecycle

Files:

- [client/src/hooks/Subscription/SubscriptionContext.tsx](/Users/cnoble/Apps/LibreChat/client/src/hooks/Subscription/SubscriptionContext.tsx)
- [client/src/hooks/Subscription/useRevenueCatInit.ts](/Users/cnoble/Apps/LibreChat/client/src/hooks/Subscription/useRevenueCatInit.ts)
- [client/src/hooks/Subscription/revenuecat.ts](/Users/cnoble/Apps/LibreChat/client/src/hooks/Subscription/revenuecat.ts)

Responsibilities:

- initialize RevenueCat on native only
- use the authenticated LibreChat user id as `appUserID`
- open paywalls on native
- open Customer Center on native
- restore purchases
- refresh backend subscription state after customer updates

### Web subscription lifecycle

Also managed from:

- [client/src/hooks/Subscription/SubscriptionContext.tsx](/Users/cnoble/Apps/LibreChat/client/src/hooks/Subscription/SubscriptionContext.tsx)

Responsibilities:

- call `/api/subscription/checkout-link`
- redirect to RevenueCat-hosted checkout
- use backend-provided management URL for web management

## How the entitlement works

The app expects a single entitlement:

- `codecan_ai_pro`

RevenueCat products:

- `monthly`
- `yearly`
- `lifetime`

All three products should unlock the same entitlement. The app does not gate features by raw product id. It gates by whether the entitlement is active.

That matters because:

- plan names can change
- products can be swapped in RevenueCat
- offerings can change without changing app logic

The app-level question is always:

- does this user currently have `codecan_ai_pro`?

## How user identity maps to RevenueCat

The canonical RevenueCat `app_user_id` is the LibreChat authenticated user id:

- `req.user.id` on the backend
- `user.id` on the client

That gives consistent identity across:

- web checkout
- iOS purchases
- Android purchases

As long as the same app user id is used everywhere, a purchase made on one platform can unlock Pro everywhere after sync.

## Normalized subscription response

The app uses a normalized payload instead of exposing raw RevenueCat response shapes.

Typical fields returned by `/api/subscription/me`:

- `enabled`
- `userId`
- `appUserId`
- `entitlementId`
- `isPro`
- `currentPlan`
- `productId`
- `store`
- `expiresAt`
- `managementUrl`
- `lastSyncedAt`
- `freeMessagesLimit`
- `freeMessagesUsed`
- `freeMessagesRemaining`
- `period`
- `webCheckoutEnabled`

This keeps the frontend simple and makes backend enforcement independent of RevenueCat response details.

## Quota model

### Rule

Non-Pro users get:

- 3 normal user-submitted messages per calendar month per account

Pro users:

- bypass quota entirely

### Reset period

Quota resets monthly using a UTC `YYYY-MM` period string.

Example:

- `2026-03`
- `2026-04`

When the stored quota period differs from the current period, usage is treated as reset.

### Stored shape

Quota is stored inside `SubscriptionProfile.quota`:

```ts
{
  period: string;
  usedMessages: number;
  limit: number;
}
```

### Countable requests

A request counts toward quota only if it is a normal new prompt.

Currently countable:

- request has non-empty `text`
- `isRegenerate !== true`
- `isContinued !== true`
- `editedContent == null`

Currently not countable:

- regenerate
- continue
- edited/resubmitted content
- abort flows
- message persistence endpoints

This logic lives in [quota.js](/Users/cnoble/Apps/LibreChat/api/server/services/Billing/quota.js).

## Why quotas are enforced on chat routes

Quota middleware is attached to the streamed chat entry routes:

- [api/server/routes/agents/chat.js](/Users/cnoble/Apps/LibreChat/api/server/routes/agents/chat.js)
- [api/server/routes/assistants/chatV1.js](/Users/cnoble/Apps/LibreChat/api/server/routes/assistants/chatV1.js)
- [api/server/routes/assistants/chatV2.js](/Users/cnoble/Apps/LibreChat/api/server/routes/assistants/chatV2.js)

This is the right place because it blocks usage before:

- model execution
- tool execution
- token spend
- streaming response work

It is intentionally not enforced:

- in `/api/messages`
- only in the client
- after generation already starts

## Atomic quota flow

When a chat request reaches quota middleware, the flow is:

1. Read public subscription config and quota settings.
2. Resolve the authenticated user id.
3. Determine whether the request is countable.
4. If the user is Pro, allow immediately.
5. If the quota period is stale, reset implicitly by writing the new period.
6. If the request is countable and below limit, atomically increment usage.
7. If the request is countable and already over limit, deny the request.

This is done with a Mongo `findOneAndUpdate` pipeline so the check-and-increment stays atomic.

## What happens when a request is denied

When quota is exceeded:

- middleware returns a typed payload through [subscriptionQuota.js](/Users/cnoble/Apps/LibreChat/api/server/middleware/subscriptionQuota.js)
- the response includes:
  - `type: "subscription_required"`
  - `code: "quota_exceeded"`
  - quota metadata

The deny flow uses [denyRequest.js](/Users/cnoble/Apps/LibreChat/api/server/middleware/denyRequest.js), which preserves the app’s existing SSE-compatible error behavior.

## Client behavior on quota errors

File: [client/src/hooks/SSE/useEventHandlers.ts](/Users/cnoble/Apps/LibreChat/client/src/hooks/SSE/useEventHandlers.ts)

When the client receives a quota/subscription error:

- it still renders the inline error message in chat
- it detects `quota_exceeded` / `subscription_required`
- it triggers `openUpgradeFlow()`

This means the user gets both:

- an explicit error in chat
- an immediate upgrade path

## Web upgrade flow

The web path is:

1. User clicks Upgrade.
2. Client calls `POST /api/subscription/checkout-link`.
3. Backend builds a RevenueCat-hosted purchase URL using the signed-in user id.
4. Browser redirects to RevenueCat-hosted checkout.
5. RevenueCat completes payment.
6. RevenueCat updates subscriber state.
7. Webhook or manual refresh syncs the backend cache.
8. `/api/subscription/me` returns `isPro: true`.

No direct Stripe Checkout is implemented in app code.

Stripe exists only behind RevenueCat Web Billing.

## Native upgrade flow

The native path is:

1. App starts and `SubscriptionProvider` initializes RevenueCat on native.
2. The current LibreChat user id is passed as `appUserID`.
3. User opens upgrade flow.
4. RevenueCat Paywall is presented.
5. Purchase completes in native store flow.
6. RevenueCat emits a customer info update.
7. Client triggers backend refresh.
8. `/api/subscription/me` returns `isPro: true`.

## Management flows

### Native

Native management uses RevenueCat Customer Center.

The action is exposed from:

- [SubscriptionContext.tsx](/Users/cnoble/Apps/LibreChat/client/src/hooks/Subscription/SubscriptionContext.tsx)

### Web

Web management uses the `managementUrl` returned from the normalized subscription response.

That URL comes from RevenueCat subscriber data and is surfaced through the backend.

## Why the backend cache exists

The app could query RevenueCat directly every time, but that would be a poor fit for:

- chat request hot paths
- quota enforcement
- webhook-driven sync
- minimizing external dependency calls per request

The cache gives:

- fast entitlement reads
- atomic quota updates
- simpler client responses
- graceful fallback if RevenueCat is temporarily unavailable

## Failure and fallback behavior

### Missing backend RevenueCat secret

If `REVENUECAT_SECRET_API_KEY` is missing:

- backend subscription sync is effectively disabled
- `/api/subscription/me` returns a disabled state
- quota enforcement also treats subscriptions as disabled

### Missing web checkout link

If `REVENUECAT_WEB_PURCHASE_LINK_URL` is missing:

- `/api/subscription/checkout-link` returns `503`
- web upgrades cannot start

### Missing native public SDK key

If public SDK keys are missing:

- native RevenueCat initialization cannot complete
- the client shows an error or warning instead of crashing

### RevenueCat API failure

If a sync fails:

- the service logs the error
- cached subscription state is used if available

## Startup config exposure

Public subscription config is included in `/api/config` and typed in:

- [packages/data-provider/src/config.ts](/Users/cnoble/Apps/LibreChat/packages/data-provider/src/config.ts)

The client receives:

- `enabled`
- `entitlementId`
- `freeMessagesPerMonth`
- `resetPolicy`
- `webCheckoutEnabled`
- optional `publicSdkKeys`

Secret backend values are not exposed.

## UI surfaces

Main UI entry points:

- [client/src/components/Nav/SettingsTabs/Account/SubscriptionSection.tsx](/Users/cnoble/Apps/LibreChat/client/src/components/Nav/SettingsTabs/Account/SubscriptionSection.tsx)
- [client/src/components/Nav/AccountSettings.tsx](/Users/cnoble/Apps/LibreChat/client/src/components/Nav/AccountSettings.tsx)

The UI shows:

- Pro vs Free state
- current plan
- free messages remaining
- upgrade button
- manage button
- restore purchases on native

## End-to-end lifecycle summary

### User without subscription

1. User signs in.
2. Client fetches `/api/subscription/me`.
3. Backend returns `isPro: false` and remaining free messages.
4. User sends up to 3 normal prompts that month.
5. The 4th normal prompt is denied before generation starts.
6. Client shows error and opens upgrade flow.

### User upgrades on web

1. Checkout starts from hosted RevenueCat link.
2. RevenueCat records purchase.
3. Webhook or refresh updates `SubscriptionProfile`.
4. User becomes `isPro: true`.
5. Quota no longer applies.

### User upgrades on native

1. Paywall opens in app.
2. Purchase succeeds through App Store / Play Store.
3. RevenueCat emits customer update.
4. Client triggers backend refresh.
5. User becomes `isPro: true`.
6. Web also sees Pro after sync because the same `app_user_id` is used.

## Suggested next documentation

If you want this documented for future maintainers, the next useful additions would be:

- a sequence diagram for web checkout vs native purchase
- a dashboard checklist with screenshots
- a runbook for debugging users whose purchases are not syncing

## Admin commands

The repo includes manual admin commands for working with the cached subscription layer:

```bash
npm run grant-pro-subscription user@example.com
npm run revoke-pro-subscription user@example.com
npm run clear-subscription-override user@example.com
npm run show-subscription user@example.com
```

### `grant-pro-subscription`

Use this when you want to manually force Pro access for a user regardless of current RevenueCat state.

What it does:

- sets `manualOverride.enabled = true`
- sets `manualOverride.mode = "grant"`
- marks the cached subscription as Pro

Result:

- RevenueCat syncs will not remove Pro access while the manual override remains enabled

### `revoke-pro-subscription`

Use this when you want to manually force a user out of Pro regardless of current RevenueCat state.

What it does:

- sets `manualOverride.enabled = true`
- sets `manualOverride.mode = "revoke"`
- marks the cached subscription as non-Pro
- preserves current quota usage

Result:

- RevenueCat syncs will not restore Pro access while the manual revoke override remains enabled

### `clear-subscription-override`

Use this when you want to stop forcing a manual billing decision and return the user to normal RevenueCat-driven behavior.

What it does:

- sets `manualOverride.enabled = false`
- clears manual override mode/source
- if RevenueCat backend sync is configured, immediately refreshes the user from RevenueCat

Result:

- the user goes back to canonical RevenueCat billing state

### `show-subscription`

Use this to inspect the current cached record.

It prints:

- basic user identity
- current plan / product / store
- `isPro`
- quota
- entitlements
- `manualOverride`

### Important distinction

`revoke-pro-subscription` is not the same as `clear-subscription-override`.

- `revoke-pro-subscription` forces a non-Pro state
- `clear-subscription-override` removes the manual override entirely

If a user has a valid RevenueCat subscription and you want that subscription to take effect again, use `clear-subscription-override`, not `revoke-pro-subscription`.
