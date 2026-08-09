const path = require('path');
const {
  migrate,
  applyRolePasswords,
  assertRoleSeparation,
  createSearchPool,
} = require('@librechat/api');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Provisions the chat_search schema.
 *
 * `CHAT_SEARCH_MIGRATE_URL` is a superuser connection that already exists —
 * normally the role the cluster was initialised with. Nothing weaker can bring a
 * database up from empty: the role migration asserts NOSUPERUSER and NOBYPASSRLS
 * on all three roles, which is a superuser operation in either direction. It also
 * cannot be one of the chat_search roles, which are created by these migrations
 * and have no password until this finishes. `migrate()` names whichever of those
 * it hits, before issuing any DDL.
 *
 * Role names are server-wide, so one PostgreSQL server serves one deployment;
 * `migrate()` warns when it finds the roles already present on a server while
 * provisioning a database that has never had them.
 *
 * Everything ends up owned by chat_search_owner, which is NOCREATEROLE and only
 * ever performs DDL. No application role is a superuser or can bypass RLS.
 */
async function main() {
  const connectionString = process.env.CHAT_SEARCH_MIGRATE_URL;
  if (!connectionString) {
    console.error(
      'CHAT_SEARCH_MIGRATE_URL is required. It must be a superuser connection that already\n' +
        'exists — CREATEROLE is not enough, because the role migration asserts NOSUPERUSER and\n' +
        'NOBYPASSRLS — and it cannot be one of the three chat_search roles, which these\n' +
        'migrations create.',
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
    if (updated.length > 0) {
      console.log(
        'Passwords were hashed here and sent as SCRAM-SHA-256 verifiers, so none of them\n' +
          'reached the server in the clear or could be written to its statement log.',
      );
    }

    /**
     * Read back what the database actually looks like rather than trusting that
     * the files above did what they say. This throws, so a run that reaches this
     * point and returns is a run whose separation held at the moment it finished
     * — nothing keeps it holding afterwards.
     */
    await assertRoleSeparation(pool);
    console.log(
      'Role separation verified: no application role is a superuser or BYPASSRLS, every\n' +
        'relation in chat_search is owned by chat_search_owner, and the request reader holds\n' +
        'nothing beyond SELECT on documents and embeddings.',
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
