import type { SearchPool } from './types';

export const OWNER_ROLE = 'chat_search_owner';
export const WRITER_ROLE = 'chat_search_writer';
export const READER_ROLE = 'chat_search_reader';

const APPLICATION_ROLES = [OWNER_ROLE, WRITER_ROLE, READER_ROLE] as const;

/** Tables the request reader must not reach at all. */
const READER_FORBIDDEN_TABLES = [
  'chat_search.outbox',
  'chat_search.watermark',
  'chat_search.lease',
  'chat_search.failures',
  'chat_search.migrations',
] as const;

const TABLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER'] as const;

const RLS_TABLES = ['documents', 'embeddings'] as const;

export type RoleViolation = {
  role: string;
  problem: string;
};

/**
 * The role-separation gate, expressed as a query rather than a checklist: no
 * application role is superuser or BYPASSRLS, the request reader owns no table
 * and holds no privilege on the projector-only tables, and the two serving
 * tables have RLS both enabled and forced.
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
    for (const table of READER_FORBIDDEN_TABLES) {
      for (const privilege of TABLE_PRIVILEGES) {
        const { rows } = await pool.query<{ granted: boolean }>(
          'SELECT has_table_privilege($1, $2, $3) AS granted',
          [READER_ROLE, table, privilege],
        );
        if (rows[0]?.granted) {
          violations.push({ role: READER_ROLE, problem: `has ${privilege} on ${table}` });
        }
      }
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
