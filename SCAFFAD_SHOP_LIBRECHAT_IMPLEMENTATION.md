# Scaffad Signage Center & Shop — LibreChat Side Implementation

This document summarizes what was implemented in the **LibreChat** repo to integrate:

- The **Signage Orders** API from the PDF Builder backend, and
- **Scaffad Shop SSO** (`renascent.scaffad.com`) via ticket-based login,

so it can be referenced from the PDF Builder / Scaffad repos.

---

## 1. Environment variables

### 1.1 PDF Builder backend (Signage Orders)

```env
# Base URL for PDF Builder backend Signage Orders API
# Includes /api so we can append /orders, /orders/:id, etc.
SIGNAGE_ORDERS_API_BASE=https://api.dev.scaffad.cloud.jamot.pro/api
# SIGNAGE_ORDERS_API_BASE=http://localhost:4000/api   # local dev
```

- All LibreChat → PDF Builder calls for signage orders are made via this base.
- Expected endpoints on the PDF Builder side (already implemented there):
  - `GET  /orders`
  - `PATCH /orders/:orderId`

### 1.2 Scaffad Shop SSO

```env
# Base URL for Scaffad Shop (used as default redirect target)
SCAFFAD_SHOP_BASE_URL=https://renascent.scaffad.com/

# Optional: TTL for shop ticket JWTs (seconds)
SCAFFAD_SHOP_TICKET_TTL_SECONDS=300

# JWT secret used to sign LibreChat & ticket JWTs.
# PDF Builder / Shop verify tickets with the same secret.
JWT_SECRET=...   # already present in the existing setup
```

The **same `JWT_SECRET`** is used to sign the short‑lived shop ticket unless a dedicated secret is introduced later.

---

## 2. Signage Orders proxy (LibreChat ↔ PDF Builder)

### 2.1 Route: `api/server/routes/signageOrders.js`

New Express router that proxies signage order requests from LibreChat to the PDF Builder backend:

- **Middleware stack**
  - `profileAuth` (custom middleware) reads the Bearer JWT from the `Authorization` header, verifies it with `JWT_SECRET`, loads the user’s `Profile` and attaches:
    - `req.user` (id, email, username)
    - `req.userProfile` / `req.profile` (with `profileType` such as `ceo` / `employee` / `customer`).

- **Base URL helper**
  - `SIGNAGE_ORDERS_API_BASE` is read from env and normalized to have no trailing slash.

- **Forwarding helper**

```js
const forwardRequest = async (method, path, req, res) => {
  const apiBase = getApiBase();
  const url = `${apiBase}${path}`;

  const headers = {
    'X-User-Id': req.user?.id,
    'X-User-Role': req.userProfile?.profileType || undefined,
  };

  const config = {
    method,
    url,
    headers,
    params: req.query,
    data: req.body,
  };

  const response = await axios(config);
  return res.status(response.status).json(response.data);
};
```

This gives the PDF Builder backend the **LibreChat user id and role** via headers, so it can implement its own authorization rules.

### 2.2 Exposed LibreChat endpoints

Mounted in `api/server/index.js` as:

```js
const signageOrdersRoutes = require('./routes/signageOrders');
app.use('/api/signage', signageOrdersRoutes);
```

Resulting HTTP endpoints:

- **CEO endpoints**
  - `GET /api/signage/orders`
    - Requires `profileType === 'ceo'` (`requireCEORole` after `profileAuth`).
    - Optional query params: `customerId`, `status` (passed through to `GET /orders` on the PDF Builder).
  - `PATCH /api/signage/orders/:orderId`
    - Also CEO‑only.
    - Body is passed through to `PATCH /orders/:orderId` (approve/reject, mark paid, assign employee, etc.).

- **Employee endpoints**
  - `GET /api/signage/my-orders`
    - For any authenticated user (employee side).
    - Internally forces `assignedTo=me` in `req.query` and forwards to `GET /orders`:

      ```js
      req.query = { ...(req.query || {}), assignedTo: 'me' };
      forwardRequest('get', '/orders', req, res);
      ```

  - `PATCH /api/signage/my-orders/:orderId/status`
    - For updating status of assigned orders (e.g. Received → Printing → Printed → Delivered).
    - Forwards body to `PATCH /orders/:orderId` on PDF Builder.

### 2.3 Expected PDF Builder behavior

On the **PDF Builder** side, for these proxied requests:

- Use `X-User-Id` to know **who** is acting.
- Use `X-User-Role` and/or your own DB to enforce:
  - CEOs can list all orders and perform admin updates.
  - Employees can only see and update orders assigned to them (for `assignedTo=me`).
- Respond with either:
  - A raw array of orders `[...]`, or
  - An object containing `orders` **or** `data`, e.g. `{ orders: [...] }` or `{ data: [...] }`.

The CEO dashboard supports all three shapes.

---

## 3. CEO dashboard — “Signage Orders” tab

File: `client/src/components/Profile/CEODashboard.tsx`

### 3.1 New types and state

- `SignageOrder` interface reflecting order data from the PDF Builder (id, customerId, type, copies, status, paid, etc.).
- New React state:
  - `orders`, `ordersLoading`, `ordersError`
  - `selectedCustomerId` (`'all'` or a specific customer id)
  - `orderActionId` (to show loading state on per‑row actions)

### 3.2 Fetching orders

- Uses `useAuthContext()` to obtain the **JWT token** and includes it as:

```ts
Authorization: `Bearer ${token}`;
```

- Calls:

```ts
GET /api/signage/orders?customerId=<optional>
```

- Response handling:

```ts
const data = await response.json();
const list: SignageOrder[] = Array.isArray(data)
  ? data
  : data.orders || data.data || [];
setOrders(list);
```

So the PDF Builder API is free to return:

- `[...]`
- `{ orders: [...] }`
- `{ data: [...] }`

### 3.3 CEO actions

All actions hit the **LibreChat proxy**, which forwards them to the PDF Builder backend:

- **Approve / Reject**

```ts
PATCH /api/signage/orders/:orderId
Body: { "approved": true | false }
```

- **Mark as paid**

```ts
PATCH /api/signage/orders/:orderId
Body: { "paid": true }   // or whatever the PDF Builder expects
```

- **Assign to employee**

```ts
PATCH /api/signage/orders/:orderId
Body: { "assignedTo": "<employeeUserId>" | null }
```

Employees are loaded from `/api/admin/users` and filtered client‑side by `profileType === 'employee'` for the assignment dropdown.

### 3.4 UI

- New tab in the CEO dashboard:
  - Label: **“Signage Orders”**
  - Icon: 🖨️
  - Badge count: `orders.length`
- Includes:
  - Customer filter (All + each `customer` profile from `/api/admin/users`).
  - Responsive table:
    - Columns: Order #, Customer, Type, Copies, Amount (if provided), Status, Paid?, Assigned To, Actions.
  - Proper loading, error, and empty states.

---

## 4. Scaffad Shop SSO

### 4.1 Ticket helper

File: `api/server/utils/scaffadShopTicket.js`

```js
const issueScaffadShopTicket = (user, profile) => {
  const secret = process.env.JWT_SECRET;
  const ttlSeconds = Number(process.env.SCAFFAD_SHOP_TICKET_TTL_SECONDS || 300);

  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name || user.username || user.email,
    role: profile?.profileType || user.role || 'customer',
  };

  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
};
```

- Uses the existing **JWT_SECRET** to sign a short‑lived `ticket` JWT.
- Role is taken from the LibreChat `Profile` when available (fallback to `user.role`).

### 4.2 Flow A — `/scaffad/shop` (LibreChat → Shop)

Mounted in `api/server/index.js`:

```js
const scaffadShopRoutes = require('./routes/scaffadShop');
app.use('/scaffad/shop', scaffadShopRoutes);
```

Route details:

- Path: `GET /scaffad/shop`
- Middleware: `requireJwtAuth` (must be logged in to LibreChat).
- Behavior:
  1. Reads `SCAFFAD_SHOP_BASE_URL` from env (e.g. `https://renascent.scaffad.com/`).
  2. Optionally accepts `redirect_uri` to override the base:

     ```text
     /scaffad/shop?redirect_uri=https%3A%2F%2Frenascent.scaffad.com%2Fcustom
     ```

  3. Loads the user’s profile to determine `role`.
  4. Calls `issueScaffadShopTicket(user, profile)` to generate `ticket`.
  5. Redirects with HTTP 302 to:

     ```text
     <redirect_base>?token=<ticket>
     ```

### 4.3 Ticket API — in-shop login 

So the user can stay on the Scaffad shop and never be redirected to LibreChat, the shop can host its own login page that calls this API.

- **Endpoint:** `POST /api/auth/scaffad/ticket` (also available as `POST /auth/scaffad/ticket` if the app is mounted there).
- **Request:**
  - `Content-Type: application/json`
  - Body: `{ "email": "<user-email>", "password": "<password>" }`
- **Success (200):**
  - Body: `{ "ticket": "<jwt>" }` — short-lived shop ticket (same format as Flow A). The shop should call its own `POST /api/auth/exchange-ticket` with this `ticket` to establish the shop session, then redirect or navigate to the shop home.
- **Failure:**
  - `400` — missing email/password, or two-factor authentication is enabled (message in body).
  - `401` — invalid email or password.
  - `500` — server error.
- **Rate limiting:** Same `loginLimiter` as the main login.

**Shop implementation:** On "Continue via LibreChat", show an in-shop login form (email + password). On submit, `fetch('https://<librechat-host>/api/auth/scaffad/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })`. If 200, take `ticket` from the response, call the shop's `POST /api/auth/exchange-ticket` with `{ ticket }`, then redirect to the shop home. No redirect to LibreChat.

### 4.4 Expected shop behavior (PDF Builder / Scaffad repo)

On the **Scaffad Shop** side (`renascent.scaffad.com`), as already described in `SCAFFAD_SHOP_INTEGRATION.md`:

1. On initial load, read `?token=<ticket>` from the URL.
2. Call the backend endpoint:

   ```http
   POST /api/auth/exchange-ticket
   Content-Type: application/json

   { "ticket": "<jwt-from-LibreChat>" }
   ```

3. Verify the ticket using **the same `JWT_SECRET`** (or a configured key for LibreChat tickets).
4. If valid, return the shop’s own JWT (`token`) and user object; store that token for subsequent `/api` calls.
5. Remove `token` from the URL via `history.replaceState`.

### 4.5 How to launch the shop from LibreChat UI

Anywhere in the LibreChat frontend (e.g. within the Signage Center entry point), you can open the shop with:

```ts
window.open('/scaffad/shop', '_blank'); // or '_self'
```

When the user is logged in:

- LibreChat backend generates `ticket` and redirects to:

  ```text
  https://renascent.scaffad.com/?token=<ticket>
  ```

- The shop’s `exchange-ticket` logic logs the user in without asking for credentials.

---

## 5. Summary for PDF Builder / Scaffad repos

From the **PDF Builder / Scaffad** side, this is what LibreChat now expects and provides:

- **Signage Orders API**
  - Base: `SIGNAGE_ORDERS_API_BASE` (e.g. `https://api.dev.scaffad.cloud.jamot.pro/api`).
  - Endpoints: `GET /orders`, `PATCH /orders/:orderId` (plus `assignedTo=me` support).
  - Headers from LibreChat:
    - `X-User-Id`: LibreChat user id.
    - `X-User-Role`: `ceo` / `employee` / `customer` (from `Profile.profileType`).
  - Response shapes accepted by CEO dashboard:
    - `[...]` or `{ orders: [...] }` or `{ data: [...] }`.

- **Shop SSO**
  - **In-shop login:** LibreChat exposes `POST /api/auth/scaffad/ticket` with body `{ email, password }`. Returns `{ ticket }`. Shop shows its own login form, calls this API, then calls its own `POST /api/auth/exchange-ticket` with the ticket. No redirect to LibreChat.
  - **From LibreChat:** `GET /scaffad/shop` (requires logged‑in user) issues a ticket and redirects to the shop with `?token=<ticket>`.
  - Shop is responsible for:
    - `POST /api/auth/exchange-ticket` that verifies the ticket with `JWT_SECRET`.
    - Returning its own JWT and logging the user in.

This document can be copied into the PDF Builder / Scaffad monorepo to describe **how LibreChat is wired** and what assumptions the backend and shop should maintain.

