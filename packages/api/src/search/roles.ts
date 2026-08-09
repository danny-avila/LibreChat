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

/**
 * Every `relkind` that carries an ACL: ordinary and partitioned tables, views,
 * materialized views, foreign tables, sequences. Indexes, composite types and
 * TOAST relations hold no grants, so they are the only ones left out — which is
 * what makes the list a property of PostgreSQL rather than of this schema.
 * `pg_tables` cannot stand in for it: views and materialized views do not appear
 * there at all, and a view over `documents` is a readable copy of it.
 */
const GRANTABLE_RELKINDS = ['r', 'p', 'v', 'm', 'f', 'S'] as const;

const RLS_TABLES = ['documents', 'embeddings'] as const;

export type RoleViolation = {
  role: string;
  problem: string;
};

/**
 * The role-separation gate, expressed as a query rather than a checklist: no
 * application role is superuser or BYPASSRLS, every relation in the schema is
 * owned by the migration owner, the request reader holds nothing beyond `SELECT`
 * on the two serving tables, and those two tables have RLS both enabled and
 * forced.
 *
 * Both halves of the reader check are derived rather than listed. The relations
 * come from `pg_class` live, so one introduced by a later migration is in scope
 * the moment it exists; the privileges come from `aclexplode` on the relation's
 * own ACL, so a privilege type this file predates is reported without being
 * named here. Grants to `PUBLIC` are read the same way, since a `PUBLIC` grant
 * reaches the reader like any other.
 *
 * Grants are all it reads. A privilege the reader could reach by `SET ROLE`,
 * because someone made it a member of another role, is not covered here.
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

  const { rows: ownerRows } = await pool.query<{ relname: string; owner: string }>(
    `SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'chat_search'
        AND c.relkind = ANY($1::"char"[])
      ORDER BY c.relname`,
    [[...GRANTABLE_RELKINDS]],
  );
  for (const row of ownerRows) {
    if (row.owner !== OWNER_ROLE) {
      violations.push({
        role: row.owner,
        problem: `owns chat_search.${row.relname} (must be ${OWNER_ROLE})`,
      });
    }
  }

  /**
   * `to_regrole` yields NULL for a role that does not exist, which matches no
   * grantee — the absence is already reported above, and a missing role must not
   * turn this query into an error.
   */
  const { rows: grantRows } = await pool.query<{
    relname: string;
    grantee: string;
    privilege: string;
  }>(
    `SELECT c.relname,
            COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') AS grantee,
            a.privilege_type AS privilege
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) AS a
      WHERE n.nspname = 'chat_search'
        AND c.relkind = ANY($1::"char"[])
        AND (a.grantee = 0 OR a.grantee = to_regrole($2)::oid)
        AND NOT (a.grantee <> 0
                 AND a.privilege_type = 'SELECT'
                 AND c.relname = ANY($3::text[]))
      ORDER BY c.relname, grantee, a.privilege_type`,
    [[...GRANTABLE_RELKINDS], READER_ROLE, [...READER_SERVING_TABLES]],
  );
  for (const row of grantRows) {
    violations.push({
      role: row.grantee,
      problem: `has ${row.privilege} on chat_search.${row.relname}`,
    });
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
