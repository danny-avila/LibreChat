SCAFFAD LUI — PRODUCT SPECIFICATION
Multi-Role Interface for Development Team
Overview
Scaffad is a signage company. We are building a unified Language User Interface (LUI) where three types of users interact with the same platform—but see different views based on their role.

Platform: LibreChat-based LUI with integrated dashboards and tools.

Goal: One interface. Three roles. Everything connected.

The Three Roles
Role Who Primary Function Customer Scaffad's clients Submit print orders, view their history Employee Printing team Manage and fulfill orders CEO Scaffad leadership Real-time overview of entire operation

ROLE 1: CUSTOMER
Who They Are
Scaffad's clients who need signage printed.

What They Access
Signage Center (already designed)

What They Can Do
Feature Description Submit print orders Upload designs, select specs, place order View order status See if order is received, printing, printed, delivered View order history All past orders with details View invoices See what's owed, what's paid Contact support Chat or submit requests

What They See
Their orders only

Their invoices only

Their history only

What They Cannot See
Other customers' data

Internal pricing or margins

Employee or CEO views

ROLE 2: EMPLOYEE (Printing Team)
Who They Are
Scaffad's internal team responsible for printing and fulfilling orders.

What They Access
Production Dashboard

What They Can Do
Feature Description View incoming orders All orders submitted by customers Update order status Mark as: Received → Printing → Printed → Delivered View order details Design files, specs, customer info, due dates Flag issues Mark orders with problems or questions View daily/weekly queue Orders to be printed today, this week

Dashboard View


┌─────────────────────────────────────────────────────────────┐
│ PRODUCTION DASHBOARD — Employee View                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TODAY'S QUEUE          │  ORDER STATUS BOARD              │
│  ────────────────       │  ─────────────────────           │
│  12 orders to print     │  [Received]  [Printing]          │
│  3 orders to deliver    │     8           4                │
│                         │                                  │
│                         │  [Printed]   [Delivered]         │
│                         │     6           22               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ INCOMING ORDERS                                             │
│ ─────────────────────────────────────────────────────────── │
│ Order #  │ Customer     │ Items │ Due Date  │ Status       │
│ 1042     │ Acme Corp    │ 3     │ Today     │ Printing     │
│ 1043     │ Beta Inc     │ 1     │ Tomorrow  │ Received     │
│ 1044     │ Gamma Ltd    │ 5     │ Mar 18    │ Received     │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
What They See
All customer orders

Order details and files

Production queue

What They Cannot See
Payment information

Customer payment history

Financial totals

CEO-level analytics

ROLE 3: CEO
Who They Are
Scaffad leadership who needs full visibility into operations.

What They Access
CEO Dashboard + LUI Chat Interface

What They Can Do
Feature Description View all orders Real-time feed of all customer orders Track order status See what's received, printing, printed, delivered View financials What's owed, what's paid, outstanding balances View customer history Full history per customer View customer overview All customers, their value, their activity Ask questions via LUI "How many orders today?" / "Who owes us money?"

Dashboard View


┌─────────────────────────────────────────────────────────────┐
│ CEO DASHBOARD — Full Visibility                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  OVERVIEW                                                   │
│  ────────                                                   │
│  Orders Today: 15       │  Revenue Today: $4,200           │
│  Orders This Week: 62   │  Revenue This Week: $18,400      │
│  Outstanding: $12,300   │  Customers Active: 34            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ORDER STATUS                                               │
│  ────────────                                               │
│  [Received: 8] [Printing: 4] [Printed: 6] [Delivered: 22]  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  RECENT ORDERS                                              │
│  ───────────────────────────────────────────────────────── │
│  Order #  │ Customer     │ Amount  │ Status    │ Paid?     │
│  1042     │ Acme Corp    │ $850    │ Printing  │ No        │
│  1043     │ Beta Inc     │ $320    │ Received  │ Yes       │
│  1044     │ Gamma Ltd    │ $1,200  │ Received  │ Partial   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CUSTOMERS OVERVIEW                                         │
│  ───────────────────────────────────────────────────────── │
│  Customer      │ Total Orders │ Lifetime Value │ Balance   │
│  Acme Corp     │ 45           │ $12,400        │ $850      │
│  Beta Inc      │ 22           │ $6,200         │ $0        │
│  Gamma Ltd     │ 38           │ $9,800         │ $2,100    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LUI — Ask Your Business                                    │
│  ─────────────────────────                                  │
│  > "Which customers have outstanding balances?"             │
│  > "How many orders are overdue?"                           │
│  > "Show me Acme Corp's full history"                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
CEO Dashboard Widgets
Widget Shows Orders Today Count of orders placed today Revenue Today Total value of today's orders Orders This Week Weekly order count Revenue This Week Weekly revenue Outstanding Balance Total unpaid across all customers Active Customers Customers with orders this month Order Status Board Received / Printing / Printed / Delivered counts Recent Orders Live feed with customer, amount, status, payment Customer Overview All customers with lifetime value and balance

LUI Chat Capabilities
The CEO can ask questions in natural language:

Question Response "How many orders today?" 15 orders totaling $4,200 "Who owes us money?" List of customers with outstanding balances "Show me Acme Corp's history" Full order history, payments, balance "What's printing right now?" List of orders currently in production "How did we do last month?" Monthly summary: orders, revenue, top customers

What They See
Everything

What They Cannot Do
Fulfill orders (that's Employee role)

Submit orders (that's Customer role)

Data Model — Core Entities
Orders
Field Description order_id Unique identifier customer_id Link to customer items List of items in order total_amount Total price amount_paid How much paid so far balance_due Outstanding amount status Received / Printing / Printed / Delivered created_at Order date due_date Expected delivery delivered_at Actual delivery date

Customers
Field Description customer_id Unique identifier name Company or individual name email Contact email total_orders Lifetime order count lifetime_value Total spent outstanding_balance Current amount owed created_at Customer since

Payments
Field Description payment_id Unique identifier order_id Link to order customer_id Link to customer amount Payment amount payment_date When paid method Card / Bank / Cash

Role-Based Access Summary
Data Customer Employee CEO Own orders ✅ ❌ ✅ All orders ❌ ✅ ✅ Order status ✅ (own) ✅ (update) ✅ (view) Own invoices ✅ ❌ ✅ All financials ❌ ❌ ✅ Customer list ❌ ❌ ✅ Customer history ❌ ❌ ✅ Production queue ❌ ✅ ✅ LUI chat ❌ ❌ ✅

Technical Notes
Authentication
Role assigned at login

Role determines dashboard view and data access

Single sign-on across platform

Real-Time Updates
Orders update live across all views

Status changes by Employee appear instantly for CEO

Customer sees status updates without refresh

LUI Integration (CEO Only)
Chat interface connected to all data

Natural language queries

Responses pull from orders, customers, payments

Future Evolution
Dashboard widgets customizable per CEO

Additional roles (e.g., Delivery, Sales)

More LUI capabilities based on feedback

Questions for Scaffad / Jamot Team
Payment tracking: Does Scaffad track partial payments, or just paid/unpaid?

Order items: What details per item? (Size, material, quantity, etc.)

Notifications: Should CEO get alerts for large orders, overdue payments?

Employee permissions: Can all employees update all orders, or assigned only?

Customer portal: Any changes needed to existing Signage Center?

Next Steps
Confirm data model with Scaffad

Build Employee Production Dashboard

Build CEO Dashboard

Integrate LUI chat for CEO

Test with live data

Iterate based on feedback

