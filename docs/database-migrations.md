# Database Migrations

One-time MongoDB scripts live in `scripts/mongo/`. They are plain JavaScript files designed to be pasted and run directly in the **MongoDB Compass** shell or `mongosh`.

---

## Tenant Backfill — `scripts/mongo/backfill-tenant.js`

Assigns a `tenantId` to every user that does not have one. Run this once when enabling multi-tenancy on an existing deployment.

**ADMIN accounts are always excluded** — platform-level admins have no tenant by design.

### How to run

1. Open MongoDB Compass and connect to your database.
2. Open the embedded **mongosh** shell (bottom panel).
3. Open `scripts/mongo/backfill-tenant.js` and edit the two variables at the top:

```js
const TENANT_ID = 'your-tenant-id-here'; // target tenant
const DRY_RUN   = true;                  // true = preview only, false = apply
```

4. Paste the full script into the shell and press **Enter**.

> Always run with `DRY_RUN = true` first to confirm the scope before applying in production.

### Output — dry run

```
Target tenant : tenant-abc123
Dry run       : true
Users found   : 42

Preview (first 10):
  alice@empresa.com [USER]
  bob@empresa.com [USER]
  ...
Set DRY_RUN = false to apply.
```

### Output — applied

```
Target tenant : tenant-abc123
Dry run       : false
Users found   : 42
Matched  : 42
Modified : 42
```
