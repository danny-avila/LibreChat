/* global db */
// ============================================================
// Tenant Backfill Migration
// Assigns a default tenantId to all users that have none.
// ADMIN accounts are excluded (they have no tenant by design).
//
// HOW TO USE:
//   1. Set TENANT_ID to the target tenant.
//   2. Set DRY_RUN = true to preview, false to apply.
//   3. Paste this entire script into the MongoDB Compass shell and run it.
// ============================================================

const TENANT_ID = 'your-tenant-id-here'; // <-- change this
const DRY_RUN = false; // <-- set to false to apply

// ------------------------------------------------------------

const filter = {
  $and: [
    { $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: '' }] },
    { role: { $ne: 'ADMIN' } },
  ],
};

const total = db.users.countDocuments(filter);

print('Target tenant : ' + TENANT_ID);
print('Dry run       : ' + DRY_RUN);
print('Users found   : ' + total);

if (total === 0) {
  print('Nothing to migrate.');
} else if (DRY_RUN) {
  print('\nPreview (first 10):');
  db.users
    .find(filter, { email: 1, role: 1 })
    .limit(10)
    .forEach((u) => print('  ' + u.email + ' [' + (u.role || '-') + ']'));
  if (total > 10) print('  ... and ' + (total - 10) + ' more.');
  print('\nSet DRY_RUN = false to apply.');
} else {
  const result = db.users.updateMany(filter, { $set: { tenantId: TENANT_ID } });
  print('Matched  : ' + result.matchedCount);
  print('Modified : ' + result.modifiedCount);
}
