import type { SearchPool } from './types';

export const OWNER_ROLE = 'chat_search_owner';
export const WRITER_ROLE = 'chat_search_writer';
export const READER_ROLE = 'chat_search_reader';

const APPLICATION_ROLES = [OWNER_ROLE, WRITER_ROLE, READER_ROLE] as const;

/**
 * The reader's entire allowance, stated as an allow-list because the complement
 * is what has to be checked and a deny-list cannot know about a table added by a
 * migration written later. Anything else in `chat_search`, and any privilege
 * beyond `SELECT` even on these two, is a violation by derivation.
 */
const READER_SERVING_TABLES = ['documents', 'embeddings'] as const;

const TABLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER'] as const;

const RLS_TABLES = ['documents', 'embeddings'] as const;

export type RoleViolation = {
  role: string;
  problem: string;
};

/**
 * The role-separation gate, expressed as a query rather than a checklist: no
 * application role is superuser or BYPASSRLS, the request reader owns no table
 * and holds nothing beyond `SELECT` on the two serving tables, and those two
 * tables have RLS both enabled and forced.
 *
 * The reader check enumerates `chat_search` live rather than naming the tables
 * it must stay off, so a table introduced by a later migration is forbidden the
 * moment it exists instead of when someone remembers to list it here.
 */
export async function findRoleViolations(pool: SearchPool): Promise<readonly RoleViolation[]> {
  const violations: RoleViolation[] = [];

  const { rows: roleRows } = await pool.query<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>('SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ANY($1::text[])', [
    [...APPLICATION_ROLES],
  ]);

  const seen = new Set<string>();
  for (const row of roleRows) {
    seen.add(row.rolname);
    if (row.rolsuper) {
      violations.push({ role: row.rolname, problem: 'is SUPERUSER' });
    }
    if (row.rolbypassrls) {
      violations.push({ role: row.rolname, problem: 'has BYPASSRLS' });
    }
  }
  for (const role of APPLICATION_ROLES) {
    if (!seen.has(role)) {
      violations.push({ role, problem: 'does not exist' });
    }
  }

  const { rows: ownerRows } = await pool.query<{ tablename: string; tableowner: string }>(
    'SELECT tablename, tableowner FROM pg_tables WHERE schemaname = $1',
    ['chat_search'],
  );
  for (const row of ownerRows) {
    if (row.tableowner !== OWNER_ROLE) {
      violations.push({
        role: row.tableowner,
        problem: `owns chat_search.${row.tablename} (must be ${OWNER_ROLE})`,
      });
    }
  }

  if (seen.has(READER_ROLE)) {
    const { rows: grantRows } = await pool.query<{ tablename: string; privilege: string }>(
      `SELECT t.tablename, p.privilege
         FROM pg_tables t
         CROSS JOIN unnest($2::text[]) AS p(privilege)
        WHERE t.schemaname = 'chat_search'
          AND NOT (p.privilege = 'SELECT' AND t.tablename = ANY($3::text[]))
          AND has_table_privilege($1, format('chat_search.%I', t.tablename), p.privilege)
        ORDER BY t.tablename, p.privilege`,
      [READER_ROLE, [...TABLE_PRIVILEGES], [...READER_SERVING_TABLES]],
    );
    for (const row of grantRows) {
      violations.push({
        role: READER_ROLE,
        problem: `has ${row.privilege} on chat_search.${row.tablename}`,
      });
    }
  }

  const { rows: rlsRows } = await pool.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'chat_search' AND c.relname = ANY($1::text[])`,
    [[...RLS_TABLES]],
  );
  const rlsSeen = new Set<string>();
  for (const row of rlsRows) {
    rlsSeen.add(row.relname);
    if (!row.relrowsecurity) {
      violations.push({ role: OWNER_ROLE, problem: `chat_search.${row.relname} has RLS disabled` });
    }
    if (!row.relforcerowsecurity) {
      violations.push({
        role: OWNER_ROLE,
        problem: `chat_search.${row.relname} does not FORCE RLS`,
      });
    }
  }
  for (const table of RLS_TABLES) {
    if (!rlsSeen.has(table)) {
      violations.push({ role: OWNER_ROLE, problem: `chat_search.${table} is missing` });
    }
  }

  return violations;
}

export async function assertRoleSeparation(pool: SearchPool): Promise<void> {
  const violations = await findRoleViolations(pool);
  if (violations.length === 0) {
    return;
  }
  const detail = violations.map(({ role, problem }) => `${role} ${problem}`).join('; ');
  throw new Error(`[chatSearch] role separation violated: ${detail}`);
}
