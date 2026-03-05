# Scaffad Shop ↔ LibreChat Integration

## 1. Context

We now have two UIs talking to the same PDF Builder backend:

- **`client/`** (embedded in LibreChat via iframe)  
  - Used by CEOs/admins/employees and customers inside LibreChat.  
  - Already handles order approval, payment, assignment, and detailed template data.
- **`shop/`** (Scaffad Shop – standalone)  
  - A customer‑friendly ecommerce front for signage templates and orders.  
  - No admin UI. All admin lives in LibreChat via the iframe client.

The **source of truth for identity is LibreChat**. The shop should never own signup; it should only trust tokens / tickets that LibreChat issues.

## 2. Goals

- **Customer experience**
  - Customers browse templates, add to cart, and place orders from Scaffad Shop.
  - They **do not sign up** on the shop; they already have a LibreChat account.
  - They can:
    - Open the shop from inside LibreChat and be auto‑signed in, or
    - Visit the shop directly and click “Continue via LibreChat” to sign in.

- **Admin experience**
  - All admin/CEO/employee actions remain in LibreChat via the iframe client:
    - View all orders, approve/reject, mark paid, assign to employees, update statuses.
  - The shop never exposes admin routes or actions.

- **Backend behaviour**
  - Orders from the shop:
    - Use the **existing payload shape**:

      ```json
      {
        "items": [...],
        "delivery": {
          "requestedDeliveryDate": "...",
          "jobNumber": "...",
          "projectName": "...",
          "deliveryContactName": "...",
          "deliveryContactPhone": "...",
          "streetAddress": "...",
          "city": "...",
          "postcode": "...",
          "state": "..."
        }
      }
      ```

    - Are accepted without requiring extra template‑specific fields like “Project Manager Name / Site Manager / Site Coordinator” (those remain optional and can be filled in later in the admin UI).
  - Existing iframe client flows and validation remain unchanged.

## 3. Auth flows we want LibreChat to support

We want **both** flows so we’re covered whether the user starts in LibreChat or at the shop URL.

### 3.1 Flow A – LibreChat opens the shop with a token in the URL

**User story**

- User is in LibreChat.
- They click “Open Scaffad Shop” (or similar).
- A new tab opens:  
  `https://scaffad.example/shop?token=<ticket>`.
- Shop exchanges that `ticket` for its own JWT, then removes `token` from the URL.

**What LibreChat needs to do**

- Provide a button / link that opens:

  ```text
  https://<scaffad-shop-host>/?token=<ticket>
  ```

- Generate `<ticket>` as a **short‑lived JWT** (or similar one‑time token) with these claims:

  ```json
  {
    "sub": "<librechat-user-id>",
    "email": "<user-email>",
    "name": "<user-display-name>",
    "role": "customer" | "employee" | "ceo",
    "exp": <short TTL, e.g. now + 5 minutes>
  }
  ```

- Sign `<ticket>` with a secret/key that the Scaffad backend can validate:
  - Easiest initial option: **same secret as `JWT_SECRET`** used by the PDF Builder backend.
  - Longer‑term: use LibreChat’s own signing key and have the backend verify using that.

**What already exists in the Scaffad repo**

- Backend endpoint: `POST /api/auth/exchange-ticket`
  - Body: `{ "ticket": "<jwt>" }`
  - Verifies `ticket` with `JWT_SECRET`.
  - Returns `{ token, user: { id, email, name, role } }` where `token` is the shop’s own JWT used by its `/api` routes.

- Shop bootstrap (`shop/src/main.tsx`):
  - On load:
    1. Reads `?token=<ticket>` from the URL.
    2. Calls `/api/auth/exchange-ticket`.
    3. Stores the returned `token` in local storage.
    4. Removes `token` from the URL via `history.replaceState`.
    5. Renders the React app.

**Net effect**

- If LibreChat opens the shop with `?token=...`, the user appears in the shop as authenticated (without typing credentials), and subsequent `/api` calls carry a shop JWT.

### 3.2 Flow B – Direct visit to shop → “Continue via LibreChat” login

**User story**

- User types `https://scaffad.example` directly.
- On the shop, they click **“Log in” → “Continue via LibreChat”**.
- They are redirected to a LibreChat login page.
- After success, LibreChat redirects them back to `https://scaffad.example/?token=<ticket>`.
- Flow A (ticket exchange) takes over.

**What LibreChat needs to provide**

- A public URL (configured in the shop as `VITE_LIBRECHAT_AUTH_URL`), e.g.:

  ```text
  https://<librechat-host>/auth/scaffad
  ```

- This endpoint should:
  1. Accept a `redirect_uri` query param:

     ```text
     /auth/scaffad?redirect_uri=https%3A%2F%2Fscaffad.example%2F
     ```

  2. Handle the entire login flow (username/password, MFA, etc.).
  3. After successful login:
     - Generate the same `ticket` JWT as in Flow A.
     - Redirect to:

       ```text
       <redirect_uri>?token=<ticket>
       ```

**What already exists in the Scaffad repo**

- `/login` route in the shop:
  - Renders a “Continue via LibreChat” button.
  - On click:

    ```ts
    const redirectUri = window.location.origin + '/';
    const base = import.meta.env.VITE_LIBRECHAT_AUTH_URL;
    window.location.href = `${base}?redirect_uri=${encodeURIComponent(redirectUri)}`;
    ```

  - So it expects LibreChat’s auth entrypoint at `VITE_LIBRECHAT_AUTH_URL` with a `redirect_uri` parameter.

- After LibreChat redirects back with `?token=...`, the same **ticket exchange** logic from Flow A runs automatically.

## 4. How orders from the shop are distinguished (no payload changes)

To avoid changing the shop’s JSON payload, the backend differentiates orders by a **header**, not by body shape.

- The shop sends a header on every request:

  ```http
  X-Scaffad-Source: shop
  ```

- In `POST /api/orders`, the controller derives:

  ```ts
  const source = req.headers['x-scaffad-source'];
  const isShopOrder = typeof source === 'string' && source.toLowerCase() === 'shop';
  ```

- For `isShopOrder === true`:
  - The backend **skips strict template field validation** when generating print jobs (it calls `pdfService.generatePrint(..., { skipValidation: true })`).
  - Only the core ecommerce fields (items, job number, project name, contact, address, requested delivery) are required.
- For the iframe `client/` (no header):
  - Existing validation remains unchanged, including errors like _“Project Manager Name is required”_ when those fields are missing from detailed template forms.

LibreChat does **not** need to send `X-Scaffad-Source`; that header is only used by the Scaffad shop.

## 5. Summary of what LibreChat needs to implement

**Required**

1. **Ticket JWT format**
   - Claims: `sub`, `email`, `name`, `role`, `exp` (short TTL).
   - Signed with a key that the Scaffad backend can verify (`JWT_SECRET` or dedicated key).

2. **Flow A – Open shop with `?token=`**
   - Button / link that opens:

     ```text
     https://<scaffad-shop-host>/?token=<ticket>
     ```

   - `ticket` is the JWT described above.

3. **Flow B – Auth entrypoint for shop**
   - Public URL, e.g. `https://<librechat-host>/auth/scaffad`, which:
     - Accepts `redirect_uri` query param.
     - Handles login.
     - On success, redirects to:

       ```text
       <redirect_uri>?token=<ticket>
       ```

**Optional / later**

- Use a distinct signing key for LibreChat tickets and configure the PDF Builder backend to verify with that key, separate from its own `JWT_SECRET`.
- Return additional claims in the ticket if we later want to:
  - Mark roles more granularly.
  - Attach organisation / tenant info to orders.

With this in place, a Cursor agent working in the LibreChat repo will understand:

- **What ticket format to issue**.
- **Where to redirect back to**.
- **Which flows to wire** to make Scaffad Shop single‑sign‑on with LibreChat while keeping all admin functionality in the existing iframe client.

