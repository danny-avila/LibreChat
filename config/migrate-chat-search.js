const path = require('path');
const { migrate, applyRolePasswords, createSearchPool } = require('@librechat/api');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Provisions the chat_search schema.
 *
 * `CHAT_SEARCH_MIGRATE_URL` is an administrative connection that already exists —
 * normally the role the cluster was initialised with. It cannot be one of the
 * chat_search roles: those are created by these migrations and have no password
 * until this finishes. `migrate()` explains exactly which privilege is missing
 * when the connection cannot do the job.
 *
 * Everything ends up owned by chat_search_owner, which is NOCREATEROLE and only
 * ever performs DDL. No application role is a superuser or can bypass RLS.
 */
async function main() {
  const connectionString = process.env.CHAT_SEARCH_MIGRATE_URL;
  if (!connectionString) {
    console.error(
      'CHAT_SEARCH_MIGRATE_URL is required. It must be an administrative connection that\n' +
        'already exists — the three chat_search roles are created by these migrations, so none\n' +
        'of them can be the role that applies them.',
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
