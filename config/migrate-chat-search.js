const path = require('path');
const { migrate, applyRolePasswords, createSearchPool } = require('@librechat/api');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Provisions the chat_search schema out of band.
 *
 * The server does this for itself at boot when `CHAT_SEARCH_OWNER_URL` is set.
 * This is for the deployments that would rather their application role never
 * hold DDL at all: run it once from a workstation or a migration job, leave
 * `CHAT_SEARCH_OWNER_URL` unset on the pods, and boot becomes a no-op.
 *
 * The owner connection is required rather than the writer one because
 * `002_roles.sql` issues CREATE ROLE and ALTER TABLE ... OWNER TO, and the
 * writer role is deliberately NOCREATEROLE and deliberately not the owner.
 */
async function main() {
  const connectionString = process.env.CHAT_SEARCH_OWNER_URL;
  if (!connectionString) {
    console.error(
      'CHAT_SEARCH_OWNER_URL is required. It must be a role that can CREATE ROLE and take\n' +
        'ownership of the chat_search tables — the writer role cannot do either.',
    );
    process.exitCode = 1;
    return;
  }

  const pool = createSearchPool({
    connectionString,
    max: 1,
    applicationName: 'librechat-chat-search-migrate',
    statementTimeoutMillis: 0,
  });

  try {
    const applied = await migrate(pool);
    console.log(
      applied.length > 0
        ? `Applied ${applied.length} migration(s): ${applied.join(', ')}`
        : 'Schema is already up to date.',
    );

    const updated = await applyRolePasswords(pool);
    console.log(
      updated.length > 0
        ? `Set the password for: ${updated.join(', ')}`
        : 'No role passwords in the environment; roles keep whatever password they already had.',
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
