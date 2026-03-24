# RevenueCat Setup

This app now uses RevenueCat for:

- native purchases in Capacitor
- hosted web checkout for browser subscriptions
- shared `codecan_ai_pro` entitlement checks
- backend-enforced free usage limits

## Required env vars

Local `.env` and deployed environments should use the same names:

```dotenv
REVENUECAT_ENTITLEMENT_ID=codecan_ai_pro
REVENUECAT_FREE_MESSAGES_PER_MONTH=3
REVENUECAT_SECRET_API_KEY=
REVENUECAT_WEBHOOK_AUTH=
REVENUECAT_WEB_PURCHASE_LINK_URL=
REVENUECAT_PUBLIC_SDK_KEY_IOS=
REVENUECAT_PUBLIC_SDK_KEY_ANDROID=
```

Notes:

- `REVENUECAT_SECRET_API_KEY` is required for backend customer sync and webhook refresh.
- `REVENUECAT_WEBHOOK_AUTH` is the token this app expects on `POST /api/webhooks/revenuecat`.
- `REVENUECAT_WEB_PURCHASE_LINK_URL` should be a RevenueCat hosted purchase link for your web offering.
- If the purchase link contains `{APP_USER_ID}` or `{{APP_USER_ID}}`, the backend will replace it with the signed-in user id automatically.
- `REVENUECAT_PUBLIC_SDK_KEY_IOS` and `REVENUECAT_PUBLIC_SDK_KEY_ANDROID` are used for native Capacitor purchases and are exposed through startup config.

## RevenueCat dashboard expectations

Configure RevenueCat with:

- entitlement: `codecan_ai_pro`
- products:
  - `monthly`
  - `yearly`
  - `lifetime`
- offering: `default`
- packages:
  - `Monthly` -> `monthly`
  - `Annual` -> `yearly`
  - `Lifetime` -> `lifetime`

## Web checkout

Web upgrades call:

- `POST /api/subscription/checkout-link`

The backend returns a RevenueCat-hosted checkout URL. The frontend redirects the user there.

## Native purchases

Native upgrades use the RevenueCat Capacitor SDK and RevenueCat UI:

- paywall for upgrade
- Customer Center for manage
- restore purchases on native only

Use the same authenticated LibreChat user id across platforms. The backend uses `req.user.id` as the RevenueCat `app_user_id`.

## Webhook

Configure a RevenueCat webhook to point to:

```text
POST /api/webhooks/revenuecat
```

Add an `Authorization` header matching `REVENUECAT_WEBHOOK_AUTH`.

## Deployment

No extra code changes are required for Docker or hosted deployments. Set the same env vars in your deployment platform:

- Docker Compose: put them in `.env` or your deployment secret store
- Helm/Kubernetes: add them as container env vars or secrets
- Render/Railway/Fly/EC2: add them to the service environment

## Current local defaults

The local `.env` now includes:

- `REVENUECAT_ENTITLEMENT_ID=codecan_ai_pro`
- `REVENUECAT_FREE_MESSAGES_PER_MONTH=3`
- the provided test public SDK key for both iOS and Android

You still need to add the real values for:

- `REVENUECAT_SECRET_API_KEY`
- `REVENUECAT_WEBHOOK_AUTH`
- `REVENUECAT_WEB_PURCHASE_LINK_URL`
