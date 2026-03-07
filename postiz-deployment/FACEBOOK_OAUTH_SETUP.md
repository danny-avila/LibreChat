# Facebook OAuth Setup for Postiz (postiz.cloud.jamot.pro)

Use this when connecting Facebook from the Postiz app and you see:

**"Can't load URL – The domain of this URL isn't included in the app's domains."**

---

## 1. App Domains (Basic settings)

1. Go to [Facebook for Developers](https://developers.facebook.com/apps/) → your app **Jamot** → **Settings** → **Basic**.
2. In **App domains**, ensure you have:
   - `postiz.cloud.jamot.pro` (you already have this)
   - `jamot.pro` (add the root domain; Facebook often requires it for subdomains)
3. Save.

---

## 2. Valid OAuth Redirect URIs (Facebook Login)

1. In the left sidebar go to **Products** (or **Use cases**) → **Facebook Login** → **Settings** (or **Customize** → **Facebook Login** → **Settings**).
2. Find **Valid OAuth Redirect URIs**.
3. Add these URLs **one per line** (exact, no trailing slash):

```
https://postiz.cloud.jamot.pro/integrations/social/facebook
https://postiz.cloud.jamot.pro/api/integrations/social/facebook/callback
https://postiz.cloud.jamot.pro/api/auth/facebook/callback
```

4. Save.

---

## 3. Postiz environment

In `postiz-deployment/.env` confirm:

- `MAIN_URL=https://postiz.cloud.jamot.pro`
- `FRONTEND_URL=https://postiz.cloud.jamot.pro`
- `NEXT_PUBLIC_BACKEND_URL=https://postiz.cloud.jamot.pro/api`
- `FACEBOOK_APP_ID=4503288746614495`
- `FACEBOOK_APP_SECRET` is set (value from Facebook app dashboard)

Restart Postiz after changes:

```bash
docker compose restart postiz
```

---

## 4. If it still fails

When the error appears, check the **full URL in the browser address bar**. That is the redirect URI Facebook is using. Add that **exact** URL to **Valid OAuth Redirect URIs** in the Facebook app, then try again.

---

## 5. App in Development mode

Your app is in **Development** mode. Only app admins/developers/testers can use Facebook Login. For real users, switch the app to **Live** and complete App Review if needed.

---

## Connecting from LibreChat

LibreChat does not call a Postiz "connect" API (Postiz has no public endpoint for that). When you click **Connect** for Facebook in LibreChat Settings → Social Accounts:

1. A new tab opens to Postiz’s integration page: `https://postiz.cloud.jamot.pro/integrations/social/facebook`.
2. You connect Facebook there (you’ve already done this in Postiz).
3. Back in LibreChat, click **Refresh** (or reopen Settings). LibreChat loads integrations from Postiz’s Public API (`GET /api/public/v1/integrations`), so your Facebook channel appears as connected.

Ensure LibreChat has `POSTIZ_API_URL=https://postiz.cloud.jamot.pro/api` (and optionally `POSTIZ_APP_URL=https://postiz.cloud.jamot.pro` if your app URL differs).
