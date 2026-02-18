# PDF Builder Repo — Signage Orders API Brief

**Purpose:** Copy or link this file into the **PDF builder** repo so the AI or team there knows exactly what to build. LibreChat (another repo) will consume these APIs for the CEO and Employee dashboards.

**Status:** ✅ **Implementation complete.** PDF builder has implemented the APIs and updated its docs. Use the PDF builder repo docs for the live API base URL, auth (headers/tokens), and exact request/response shapes. Next: Phase 2 in LibreChat (proxy + CEO Orders tab).

---

## Context

- **This repo (PDF builder):** Customers already submit print/buy requests and see order history here. You now need to expose **backend APIs** so that:
  - **CEO** (in LibreChat) can list all orders, filter by customer, approve/reject, mark as paid, and assign an order to an employee.
  - **Employee** (in LibreChat) can list orders assigned to them and update order status (Received → Printing → Printed → Delivered).
- **Other repo (LibreChat):** Will call your APIs (directly or via a proxy) and render the CEO/Employee UIs. You only need to implement the APIs and document base URL + auth.

---

## Order / Request Data Model

Extend or align your existing order/request schema with at least:

| Field | Description |
|-------|-------------|
| `orderId` (or `_id`) | Unique identifier |
| `customerId` | LibreChat user id of the customer who placed the order |
| `type` | `"print"` or `"buy"` |
| `copies` | Number of copies (if print) |
| `totalAmount` (or `amount`) | Total price |
| `amountPaid` | How much paid so far (for partial payments) |
| `paid` | Boolean: fully paid (optional; can be derived from amountPaid >= totalAmount) |
| `status` | See status flow below |
| `assignedTo` | LibreChat user id of the employee assigned to fulfill (optional until CEO assigns) |
| `createdAt` | Order date |
| `dueDate` | Expected delivery (optional) |
| `deliveredAt` | Actual delivery (optional) |
| `items` | List of line items (optional; keep if you already have it) |

**Status flow:**

- When customer submits: e.g. `pending_approval` (or keep your current “pending”).
- CEO can set: `approved` or `rejected`.
- After approval, production status: `received` → `printing` → `printed` → `delivered`.

So `status` should support at least: `pending_approval`, `approved`, `rejected`, `received`, `printing`, `printed`, `delivered`.

---

## API Endpoints to Implement

Base path examples: `/api/orders` or `/api/signage/orders`. Use one and document it.

**Auth:** Caller will send identity (e.g. LibreChat JWT or `X-User-Id` + role). You must enforce:

- **CEO:** can call list (all), filter, approve, mark paid, assign.
- **Employee:** can call list (assigned to me only) and update status (for assigned orders).

How you verify “CEO” vs “Employee” is up to you (e.g. role in JWT, or a separate API key / service token from LibreChat backend). Document what you expect.

---

### 1. List orders (for CEO)

- **Method/Path:** `GET /api/orders` (or `GET /api/signage/orders`)
- **Query params:**
  - `customerId` (optional) — filter by LibreChat user id of customer
  - `status` (optional) — filter by status
  - `page`, `limit` (optional) — pagination
- **Response:** `200` + JSON array of orders. Each order should include customer display info (e.g. `customerName`, `customerEmail`) if you have it; otherwise LibreChat can resolve from `customerId`.
- **Who:** CEO only (reject or return 403 for non-CEO).

---

### 2. Approve or reject request (CEO)

- **Method/Path:** `PATCH /api/orders/:orderId`
- **Body:** `{ "approved": true }` or `{ "approved": false }`  
  - Or alternatively `{ "status": "approved" }` / `{ "status": "rejected" }` if you prefer.
- **Response:** `200` + updated order (or `204` no content). `404` if order not found; `403` if not CEO.
- **Who:** CEO only.

---

### 3. Mark as paid (CEO)

- **Method/Path:** `PATCH /api/orders/:orderId`
- **Body:** `{ "paid": true }` (full payment) or `{ "amountPaid": number }` (partial). Choose one scheme and document it.
- **Response:** `200` + updated order (or `204`). `404`/`403` as above.
- **Who:** CEO only.

---

### 4. Assign to employee (CEO)

- **Method/Path:** `PATCH /api/orders/:orderId`
- **Body:** `{ "assignedTo": "<LibreChat userId of employee>" }`. To unassign: `{ "assignedTo": null }`.
- **Response:** `200` + updated order (or `204`). `404`/`403` as above.
- **Who:** CEO only.

---

### 5. List orders assigned to me (Employee)

- **Method/Path:** `GET /api/orders?assignedTo=me` or `GET /api/orders/mine`
- **Auth:** Current user id must be sent (e.g. JWT or `X-User-Id`). Return only orders where `assignedTo === current user id`.
- **Response:** `200` + JSON array of orders (same shape as list for CEO, or a subset of fields).
- **Who:** Employee only (and only their assigned orders).

---

### 6. Update order status (Employee)

- **Method/Path:** `PATCH /api/orders/:orderId`
- **Body:** `{ "status": "received" | "printing" | "printed" | "delivered" }`
- **Response:** `200` + updated order (or `204`). `404` if not found; `403` if not allowed (e.g. only the assigned employee can update, or any employee — document which you enforce).
- **Who:** Employee only (and ideally only the assigned employee for that order).

---

## Suggested order of implementation

1. **Confirm or extend** your order/request schema (add `approved`, `assignedTo`, and production statuses if missing).
2. **Implement** `GET /api/orders` with optional `customerId` and `status` filters; enforce CEO for this list.
3. **Implement** `PATCH /api/orders/:orderId` for: approve/reject, mark paid, assign, and (separately) status update. Enforce CEO vs Employee and assigned-to-me where needed.
4. **Implement** `GET /api/orders?assignedTo=me` (or `/api/orders/mine`) for employees.
5. **Document** for the LibreChat repo:
   - API base URL (e.g. `https://your-pdf-builder.com`)
   - Auth: what header or token you expect (e.g. `Authorization: Bearer <JWT>`, or `X-User-Id` + `X-User-Role`).
   - Exact paths and body/query shapes so LibreChat can implement the proxy or direct calls.

---

## What LibreChat will do after this

- CEO dashboard: new “Orders” tab that calls your list endpoint, shows filters (by customer), and buttons for approve, reject, mark paid, assign to employee.
- Employee dashboard: new “Signage orders” tab that calls your “assigned to me” endpoint and allows status updates.

No UI for orders is required in the PDF builder repo for CEO/Employee; only the APIs above.

---

## API documentation for LibreChat (implemented)

**Base URL:** Use the PDF Builder API root (e.g. `https://your-pdf-builder.com/api` or `http://localhost:4000/api` when embedded).

**Auth:** The PDF Builder runs in an iframe; the client (LibreChat) sends these headers on each request:

| Header       | Required | Description |
|-------------|----------|-------------|
| `X-User-Id` | Yes      | LibreChat user id (customer, employee, or CEO). |
| `X-User-Role` | For CEO/Employee APIs | `ceo`, `employee`, or `customer`. Omitted = customer. |

No JWT in this implementation; role is trusted from the header. For production, LibreChat backend should set these when proxying requests, or validate the iframe origin.

**Paths and shapes:**

- **GET /api/orders**  
  - **CEO:** Query params: `customerId` (optional), `status` (optional), `page`, `limit`. Returns all orders.  
  - **Employee:** Query params: `assignedTo=me` (required), `status` (optional), `page`, `limit`. Returns orders where `assignedTo` = current user.  
  - **Customer:** Returns only orders where `userId` = current user (same query params `status`, `page`, `limit`).  
  - Response: `200` + `{ data: Order[], pagination: { page, limit, total, totalPages } }`.

- **GET /api/orders/:orderId**  
  - CEO/Employee: can get any order by id. Customer: only own orders.  
  - Response: `200` + single order object.

- **PATCH /api/orders/:orderId**  
  - **CEO only:** `{ "approved": true | false }` or `{ "status": "approved" | "rejected" }`; `{ "paid": true }` or `{ "amountPaidCents": number }`; `{ "assignedTo": "<userId>" | null }`.  
  - **Employee (assigned only):** `{ "status": "received" | "printing" | "printed" | "delivered" }`.  
  - Response: `200` + updated order. `403` if role/assignment not allowed; `404` if order not found.

Order response shape includes: `orderId`, `customerId` (= `userId`), `type`, `copies`, `totalAmount` (dollars), `totalCents`, `amountPaidCents`, `paid`, `status`, `assignedTo`, `createdAt`, `dueDate`, `deliveredAt`, `items`, delivery fields, etc.

---

*Generated from LibreChat repo implementation plan. Copy this file into the PDF builder repo when starting work there.*
