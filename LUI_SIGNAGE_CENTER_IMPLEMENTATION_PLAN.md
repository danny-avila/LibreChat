# LUI Signage Center — Implementation Plan

Based on **LUI_SIGNAGE_CENTER_REQUIREMENT.md** and current state: PDF builder has **print**, **buy**, and **order history**; LibreChat has CEO / Employee / Customer dashboards (projects, tasks, tickets, users). This plan adds **Signage orders** (print & buy requests) to CEO and Employee dashboards and improves UI.

---

## Current state (done)

| Where | What's done |
|-------|-------------|
| **PDF Builder (other repo)** | Customer: submit print request, select copies, buy option; order history. **✅ CEO/Employee order APIs:** list (with customer filter), approve/reject, mark paid, assign, "my orders", update status. Docs updated with base URL and auth. |
| **LibreChat** | CEO dashboard (overview, projects, tasks, tickets, analytics, **users**); Employee dashboard (projects, tasks, support); Customer dashboard; Signage Center iframe (PDF builder); role-based profile (ceo / employee / customer). **✅ CEO Orders tab:** complete with filters, approve/reject, mark paid, assign to employee. |

---

## Goal (to build)

| Role | New / updated capability |
|------|---------------------------|
| **CEO** | ✅ See **all** print/buy requests; filter by customer; **approve** or reject requests; **mark as paid**; **assign** a print request to an employee; dashboard UI user-friendly and responsive. |
| **Employee** | See **only requests assigned to them** by CEO; update status (e.g. Received → Printing → Printed → Delivered). Employee dashboard UI can be refined later. |
| **Customer** | No change in LibreChat; already uses Signage Center (PDF builder) for order history. |

---

## Data and API ownership

- **Orders** (print/buy requests) are created in the **PDF builder** flow; the **source of truth** for orders (id, customer_id, status, amount, paid, assignedTo, etc.) should live in one place:
  - Either **PDF builder backend** (existing) — then it exposes **CEO/Employee APIs** (list orders, approve, mark paid, assign).
  - Or a **shared service** both PDF builder and LibreChat call — then both repos integrate with that API.

- **LibreChat** needs to:
  - Call those APIs (directly or via a small LibreChat proxy that adds auth).
  - Render CEO and Employee UIs for orders (tables, filters, actions).

This plan assumes the **PDF builder backend** holds orders and will expose the new endpoints; LibreChat consumes them. If you later move orders to a shared service, only the API base URL and auth need to change.

---

## Plan overview

| Phase | Focus | Status | Repo |
|-------|--------|--------|------|
| **1** | Order model & CEO/Employee APIs (list, filter, approve, mark paid, assign) | ✅ DONE | **PDF Builder** |
| **2** | LibreChat API layer (proxy or direct) + CEO dashboard: orders tab, filters, actions | ✅ DONE | **LibreChat** |
| **3** | Employee dashboard: "Assigned to me" orders + status updates | ✅ DONE | **LibreChat** + **PDF Builder** |
| **4** | CEO (and optionally Employee) dashboard UI: responsive, user-friendly | ✅ DONE | **LibreChat** |

---

## Phase 1: Order APIs in PDF Builder (other repo) ✅ COMPLETED

**Goal:** PDF builder backend exposes APIs so CEO can see and act on all requests; Employee can see assigned requests and update status.

| Step | Task | Status | Notes |
|------|------|--------|-------|
| 1.1 | **Confirm order/request schema** | ✅ DONE | Schema includes: `orderId`, `customerId`, `type`, `copies`, `amount`, `status`, `paid`, `assignedTo`, `createdAt`, etc. |
| 1.2 | **List orders (CEO)** | ✅ DONE | `GET /api/orders` with query params `?customerId=...`, `?status=...`, pagination. |
| 1.3 | **Approve / reject request** | ✅ DONE | `PATCH /api/orders/:id` body: `{ approved: true \| false }`. CEO only. |
| 1.4 | **Mark as paid** | ✅ DONE | `PATCH /api/orders/:id` body: `{ paid: true }` or `{ amountPaid: number }`. CEO only. |
| 1.5 | **Assign to employee** | ✅ DONE | `PATCH /api/orders/:id` body: `{ assignedTo: userId }`. CEO only. |
| 1.6 | **List orders assigned to me (Employee)** | ✅ DONE | `GET /api/orders?assignedTo=me` returns orders where `assignedTo === current user id`. Employee only. |
| 1.7 | **Update order status (Employee)** | ✅ DONE | `PATCH /api/orders/:id` body: `{ status: 'received' \| 'printing' \| 'printed' \| 'delivered' }`. |

**Deliverable:** ✅ PDF builder backend has all endpoints; docs updated with base URL and auth.

---

## Phase 2: LibreChat — CEO dashboard orders (this repo) ✅ COMPLETED

**Goal:** CEO sees all requests, filters by customer, approves/rejects, marks paid, assigns to employee.

| Step | Task | Status | Implementation Details |
|------|------|--------|------------------------|
| 2.1 | **API integration** | ✅ DONE | Environment variable `SIGNAGE_ORDERS_API_BASE=http://localhost:4000/api` configured in `.env`. Backend proxy chosen for security. |
| 2.2 | **Backend proxy routes** | ✅ DONE | File: `api/server/routes/signageOrders.js`. Routes: `GET /api/signage/orders`, `PATCH /api/signage/orders/:id`. JWT auth + CEO role verification via `requireCEORole` middleware. Forwards to PDF builder with `X-User-Id` and `X-User-Role` headers. Registered in `api/server/index.js`. |
| 2.3 | **CEO dashboard: Orders tab** | ✅ DONE | Orders tab implemented in `client/src/components/Profile/CEODashboard.tsx`. Full table with columns: Order #, Customer, Type, Copies, Amount, Status, Paid?, Assigned to, Actions. Loading, error, and empty states implemented. |
| 2.4 | **Filter by customer** | ✅ DONE | Customer filter dropdown (lines 1067-1084 in CEODashboard.tsx). Shows "All customers" option + list of users with `profileType === 'customer'`. Calls `fetchOrders(customerId)` on selection. Refresh button included. |
| 2.5 | **Actions: Approve / Reject** | ✅ DONE | `handleApproveOrder(orderId, approved)` function implemented. Green "Approve" and red "Reject" buttons. Calls `PATCH /api/signage/orders/:id` with `approved: true/false`. Shows toast notification and refreshes list on success. |
| 2.6 | **Action: Mark as paid** | ✅ DONE | `handleMarkPaid(orderId)` function implemented. Blue "Mark Paid" button (disabled if already paid). Calls `PATCH /api/signage/orders/:id` with `paid: true`. Shows toast and refreshes list. |
| 2.7 | **Action: Assign to employee** | ✅ DONE | `handleAssignEmployee(orderId, employeeId)` function implemented. Inline dropdown in "Assigned To" column showing employees (filtered by `profileType === 'employee'`). Calls `PATCH /api/signage/orders/:id` with `assignedTo: userId`. Shows assigned employee name below dropdown. |

**Deliverable:** ✅ CEO can open Dashboard → Orders tab, see all requests, filter by customer, approve/reject, mark paid, assign to employee. All actions working with proper error handling and user feedback.

---

## Phase 3: LibreChat — Employee dashboard "Assigned to me" (this repo) ✅ COMPLETED

**Goal:** Employee sees only orders assigned to them and can update status.

| Step | Task | Status | Implementation Details |
|------|------|--------|------------------------|
| 3.1 | **API for "my orders"** | ✅ DONE | Backend route already exists: `GET /api/signage/my-orders` in `api/server/routes/signageOrders.js`. Forwards to PDF builder with `assignedTo=me` query param. |
| 3.2 | **Employee dashboard: "Signage orders" or "Print queue" tab** | ✅ DONE | New "Print Queue" tab added to `EmployeeDashboard.tsx`. Table displays: Order #, Customer, Type, Copies, Amount, Status, Due Date, Update Status. Includes loading, error, and empty states. Added Print Orders stat to ProfileStats. |
| 3.3 | **Update status** | ✅ DONE | Status dropdown with options: Received → Printing → Printed → Delivered. Calls `PATCH /api/signage/my-orders/:id/status` with `status: '...'`. Shows toast notification on success. Only updates orders assigned to current employee. |

**Deliverable:** ✅ Employee sees assigned orders and can move them through statuses. Status changes are color-coded (gray for received, yellow for printing, blue for printed, green for delivered).

---

## Phase 4: CEO (and Employee) dashboard UI (this repo) ✅ COMPLETED

**Goal:** User-friendly, responsive CEO dashboard; optional polish for Employee dashboard.

| Step | Task | Status | Implementation Details |
|------|------|--------|------------------------|
| 4.1 | **CEO dashboard layout** | ✅ DONE | Responsive grid already in place with overview KPIs at top, tabs for navigation. Uses existing Tailwind patterns and CEO components. |
| 4.2 | **Orders tab UX** | ✅ DONE | Added confirmation dialogs for Approve/Reject actions using `ConfirmActionModal` component. Clear messaging for each action. Loading states already implemented. |
| 4.3 | **CEO overview widget** | ✅ DONE | Created `CEOSignageOrdersWidget` component showing: Orders Today, Revenue Today, Outstanding balance, Total Orders, and Status breakdown (Pending/Printing/Completed). Widget includes "View All" button to navigate to Orders tab. |
| 4.4 | **Employee dashboard** | ✅ DONE | Employee Print Queue tab already responsive with same design system. Table layout with proper loading/error/empty states. |

**Deliverable:** ✅ CEO and Employee dashboards are clear, consistent, and work on desktop and mobile. Confirmation dialogs prevent accidental actions. Overview widget provides at-a-glance signage order metrics.

---

## Summary: where each piece lives

| Work | Status | Repo |
|------|--------|------|
| Order schema, list/filter, approve, mark paid, assign, list-by-assignee, update status | ✅ DONE | **PDF Builder** (backend APIs) |
| CEO dashboard: Orders tab, filters, approve/reject, mark paid, assign to employee | ✅ DONE | **LibreChat** |
| Employee dashboard: Assigned orders tab, update status | ✅ DONE | **LibreChat** |
| CEO/Employee dashboard UI: responsive, user-friendly, confirmation dialogs, overview widget | ✅ DONE | **LibreChat** |
| Auth/role checks for CEO vs Employee | ✅ DONE | **LibreChat** (proxy) and **PDF Builder** |

---

## Suggested order of implementation

1. ~~**PDF Builder:** Implement order list (with optional customer filter), approve, mark paid, assign, "my orders", update status (Phases 1.2–1.7). Document API and auth.~~ ✅ **Done.**
2. ~~**LibreChat:** Add proxy and CEO Orders tab with table, filters, and actions (Phase 2). Use PDF builder docs for base URL and auth.~~ ✅ **Done.**
3. ~~**LibreChat:** Add Employee "Assigned to me" tab and status update (Phase 3).~~ ✅ **Done.**
4. ~~**LibreChat:** Polish CEO (and Employee) dashboard UI for responsiveness and clarity (Phase 4).~~ ✅ **Done.**

---

## 🎉 ALL PHASES COMPLETE!

The LUI Signage Center multi-role interface is now fully implemented with:
- ✅ CEO can view all orders, filter by customer, approve/reject, mark paid, assign to employees
- ✅ Employees can view assigned orders and update status through production workflow
- ✅ Customers can submit orders through PDF Builder (Signage Center)
- ✅ Overview dashboard widget showing key signage metrics
- ✅ Confirmation dialogs for critical actions
- ✅ Responsive design across all dashboards
- ✅ Role-based access control and authentication

---

## Open questions (from requirement doc)

- **Payment tracking:** Partial payments or only paid/unpaid? (Affects PDF builder schema and "mark as paid" semantics.)
- **Order items:** Full details per item (size, material, quantity) for CEO/Employee view? (Affects API response shape.)
- **Notifications:** Alerts for CEO on large orders or overdue payments? (Future.)
- **Employee permissions:** Can any employee update any order, or only assigned? (Plan assumes only assigned; PDF builder can enforce.)

---

*Last updated: 2026-02-18. Align with LUI_SIGNAGE_CENTER_REQUIREMENT.md and PDF builder product spec.*
