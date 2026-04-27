# RevenueCat Web Billing Local Setup

This guide is specifically for setting up and testing the **web subscription flow** locally.

This app uses:

- **RevenueCat** as the billing and entitlement layer
- **RevenueCat Web Billing** for hosted browser checkout
- **Stripe connected inside RevenueCat** as the payment processor

This app does **not** use direct Stripe Checkout in app code for web subscriptions.

## What you are setting up

The web billing flow in this repo is:

1. A signed-in web user clicks `Upgrade`.
2. The backend calls RevenueCat and returns a hosted checkout URL.
3. The user completes checkout in RevenueCat's hosted web flow.
4. RevenueCat updates the user's entitlement.
5. This app refreshes and caches that entitlement in Mongo.
6. The user becomes Pro and is no longer blocked by the free-tier quota.

## Before you start

You need:

- a RevenueCat account and project
- a Stripe account
- local access to this repo
- a running MongoDB instance for local LibreChat development

You will also want a local LibreChat test account you can log into in the browser.

## Step 1: Open the correct RevenueCat project

In RevenueCat:

1. Open the project for this app.
2. Confirm the Pro entitlement will be:

```text
codecan_ai_pro
```

This app assumes that entitlement id by default.

## Step 2: Connect Stripe to RevenueCat

In RevenueCat:

1. Go to the Stripe connection flow.
2. Connect the Stripe account you want to use.
3. If you are only testing locally, Stripe test mode is enough.

Important notes:

- Stripe is used **through RevenueCat**, not directly by this app.
- RevenueCat's hosted web checkout is what the frontend opens.
- If you use a separate Stripe sandbox account, keep that separate from production.

## Step 3: Add a Web Billing config in RevenueCat

In RevenueCat:

1. Go to the project store/provider configuration area.
2. Add a **Web Billing** provider/config for the project.
3. Make sure it uses the Stripe account you connected in Step 2.

You need Web Billing enabled before you can create web products and purchase links.

## Step 4: Create the web products

Create these products in RevenueCat for the Web Billing provider:

- `monthly`
- `yearly`
- `lifetime`

Recommended setup:

- `monthly`: auto-renewing monthly subscription
- `yearly`: auto-renewing yearly subscription
- `lifetime`: one-time non-consumable purchase

Use the exact identifiers above. The app expects them.

## Step 5: Create the entitlement

In RevenueCat:

1. Go to the entitlement section.
2. Create:

```text
Identifier: codecan_ai_pro
Display name: CodeCan AI Pro
```

3. Attach all three products to that entitlement:

- `monthly`
- `yearly`
- `lifetime`

The app checks whether the entitlement is active. It does not gate features by raw product id.

## Step 6: Create the offering

In RevenueCat:

1. Create an offering:

```text
default
```

2. Add package mappings:

- `Monthly` package -> `monthly`
- `Annual` package -> `yearly`
- `Lifetime` package -> `lifetime`

3. Make `default` the current/default offering.

This is the offering your hosted checkout and native paywall should point at.

## Step 7: Create a hosted Web Purchase Link

In RevenueCat:

1. Go to the web billing / purchase links area.
2. Create a **Web Purchase Link**.
3. Attach it to the `default` offering.
4. Use RevenueCat hosted checkout.

For local testing, configure success handling in one of these ways:

- use RevenueCat's default success page
- redirect back to your local app, for example:

```text
http://localhost:5173/c/new
```

RevenueCat will give you:

- a **Sandbox URL**
- a **Production URL**

For local testing, use the **Sandbox URL**.

## Step 8: Add the required local env vars

Set these in your local `.env`:

```dotenv
REVENUECAT_ENTITLEMENT_ID=codecan_ai_pro
REVENUECAT_FREE_MESSAGES_PER_MONTH=3
REVENUECAT_SECRET_API_KEY=YOUR_REVENUECAT_SECRET_API_KEY
REVENUECAT_WEBHOOK_AUTH=YOUR_RANDOM_WEBHOOK_TOKEN
REVENUECAT_WEB_PURCHASE_LINK_URL=https://pay.rev.cat/sandbox/YOUR_TOKEN/{APP_USER_ID}
```

Optional native SDK keys:

```dotenv
REVENUECAT_PUBLIC_SDK_KEY_IOS=YOUR_IOS_PUBLIC_SDK_KEY
REVENUECAT_PUBLIC_SDK_KEY_ANDROID=YOUR_ANDROID_PUBLIC_SDK_KEY
```

Notes:

- `REVENUECAT_SECRET_API_KEY` is required for backend sync and hosted checkout link handling.
- `REVENUECAT_WEBHOOK_AUTH` is checked by this app on the RevenueCat webhook route.
- `REVENUECAT_WEB_PURCHASE_LINK_URL` should be the **sandbox** hosted purchase link while testing locally.
- For identified users, use path-style app user id format: `https://pay.rev.cat/<token>/{APP_USER_ID}`.

## Step 9: Understand how user identity works

This app uses the signed-in LibreChat user id as the RevenueCat `app_user_id`.

That means:

- web purchases are tied to the signed-in LibreChat account
- native purchases are tied to the same account
- web and native can share the same `codecan_ai_pro` entitlement

The backend builds the hosted checkout URL for the signed-in user.

If your purchase link template uses an app user id placeholder, this app replaces it automatically with the authenticated user id.

## Step 10: Start LibreChat locally

Run the backend:

```bash
npm run backend:dev
```

Run the frontend:

```bash
npm run frontend:dev
```

Then open:

```text
http://localhost:5173
```

Log in with a normal non-Pro test account.

## Step 11: Test the hosted checkout flow locally

From the app:

1. Open account/settings.
2. Find the subscription section.
3. Click `Upgrade`.
4. Confirm you are redirected to RevenueCat's hosted checkout page.
5. Complete checkout using Stripe test payment details.

Expected result:

- checkout completes in the RevenueCat-hosted page
- RevenueCat marks the user entitled
- this app refreshes the cached subscription state
- the user becomes Pro

## Step 12: Decide how you want local sync to happen

This repo caches subscription state in Mongo, so a purchase does not become visible in the app until a sync happens.

You have two good local testing options.

### Option A: Use a webhook tunnel

This is the best local setup.

1. Expose your local backend with a tunnel like `ngrok` or Cloudflare Tunnel.
2. Point RevenueCat's webhook at:

```text
https://YOUR_PUBLIC_URL/api/webhooks/revenuecat
```

3. Add this request header:

```text
Authorization: YOUR_RANDOM_WEBHOOK_TOKEN
```

With that in place, RevenueCat will notify your local backend automatically after purchases and renewals.

### Option B: Force a manual subscription refresh

If you do not want to set up a webhook tunnel yet:

1. complete the hosted checkout
2. call the refresh endpoint while logged in:

```text
POST /api/subscription/refresh
```

That forces the backend to pull fresh canonical state from RevenueCat and update the cached `SubscriptionProfile`.

## Step 13: Verify the user became Pro

Use the built-in admin helper:

```bash
npm run show-subscription you@example.com
```

You should see a cached subscription record showing:

- `isPro: true`
- entitlement `codecan_ai_pro`
- a plan/product matching `monthly`, `yearly`, or `lifetime`

You can also verify in the app's account/settings UI.

## Step 14: Verify quota behavior

This app enforces a free tier for non-Pro users:

- `3` normal user-submitted chat prompts per calendar month

To test:

1. use a non-Pro user and send 3 normal prompts
2. confirm they are allowed
3. send a 4th normal prompt
4. confirm the backend blocks it and the client opens the upgrade flow

After a successful web purchase and sync:

- the user should become Pro
- the free-tier quota should no longer block prompts

## Step 15: Move from local sandbox testing to production

When you are ready for production:

1. replace `REVENUECAT_WEB_PURCHASE_LINK_URL` with the **production** purchase link
2. use the correct production `REVENUECAT_SECRET_API_KEY`
3. point RevenueCat webhooks at your deployed backend
4. use your real iOS/Android public SDK keys for native builds

Do not use sandbox purchase links for real users.

## Local testing checklist

Use this as a short validation list:

- Stripe connected in RevenueCat
- Web Billing config added in RevenueCat
- products `monthly`, `yearly`, `lifetime` created
- entitlement `codecan_ai_pro` created
- `default` offering created with monthly/annual/lifetime packages
- sandbox hosted purchase link created
- local `.env` set with RevenueCat secret, webhook token, and sandbox purchase link
- LibreChat backend running locally
- LibreChat frontend running locally
- webhook tunnel configured or manual refresh plan ready
- test user can open hosted checkout from the app
- completed checkout turns the user into Pro

## Related docs in this repo

- [REVENUECAT_SETUP.md](/Users/cnoble/Apps/LibreChat/docs/REVENUECAT_SETUP.md)
- [REVENUECAT_ARCHITECTURE.md](/Users/cnoble/Apps/LibreChat/docs/REVENUECAT_ARCHITECTURE.md)

## External RevenueCat docs

- [Offerings overview](https://www.revenuecat.com/docs/offerings/overview)
- [Configuring products](https://www.revenuecat.com/docs/projects/configuring-products)
- [Connect a store or web provider](https://www.revenuecat.com/docs/projects/connect-a-store)
- [Connect Stripe account](https://www.revenuecat.com/docs/web/connect-stripe-account)
- [Configure Web Billing products & prices](https://www.revenuecat.com/docs/web/web-billing/product-setup)
- [Web Purchase Links](https://www.revenuecat.com/docs/web/web-billing/web-purchase-links)
- [Testing Web Purchases](https://www.revenuecat.com/docs/web/web-billing/testing)
