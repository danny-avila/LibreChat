import { logger } from '@librechat/data-schemas';
import type { SearchPool } from './types';

/**
 * Base role names. Deployment-facing code never uses these directly: the names
 * a database actually carries come from `managedRoles()`, which applies the
 * deployment prefix. Only the prefix machinery and the specs that run without
 * one touch the bases.
 */
export const OWNER_ROLE = 'chat_search_owner';
export const WRITER_ROLE = 'chat_search_writer';
export const READER_ROLE = 'chat_search_reader';

/** PostgreSQL truncates identifiers past NAMEDATALEN-1 silently; refuse instead. */
const MAX_IDENTIFIER_LENGTH = 63;
const LONGEST_BASE_ROLE = WRITER_ROLE;
const IDENTIFIER_SAFE = /^[a-z_][a-z0-9_]*$/;

/**
 * Deployment prefix for the cluster-global role names, following the
 * `REDIS_KEY_PREFIX` / `REDIS_KEY_PREFIX_VAR` convention: set the prefix
 * directly, or name another environment variable that carries it — never both.
 *
 * Role names are the one cluster-global thing these migrations create. Two
 * deployments sharing a PostgreSQL cluster under one set of names would rotate
 * each other's credentials on every provisioning run, and the surviving
 * credential could read both databases. A per-deployment prefix gives each its
 * own principals; `migrate.spec.ts` proves the isolation in 'provisions two
 * deployments on one cluster without sharing credentials'.
 *
 * Lowercase identifier characters only: the prefix lands in migration SQL as a
 * raw identifier, where anything else would fold, quote, or truncate silently.
 */
export function chatSearchRolePrefix(): string {
  const direct = process.env.CHAT_SEARCH_ROLE_PREFIX;
  const indirection = process.env.CHAT_SEARCH_ROLE_PREFIX_VAR;
  if (direct && indirection) {
    throw new Error(
      '[chatSearch] Only either CHAT_SEARCH_ROLE_PREFIX_VAR or CHAT_SEARCH_ROLE_PREFIX can be set.',
    );
  }
  const prefix = direct ?? (indirection ? process.env[indirection] : undefined) ?? '';
  if (prefix === '') {
    return '';
  }
  if (!IDENTIFIER_SAFE.test(prefix)) {
    throw new Error(
      `[chatSearch] role prefix ${JSON.stringify(prefix)} is not a safe PostgreSQL identifier ` +
        'prefix: lowercase letters, digits and underscores only, not starting with a digit ' +
        '(it is spliced into migration SQL as a raw identifier).',
    );
  }
  if (prefix.length + LONGEST_BASE_ROLE.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(
      `[chatSearch] role prefix ${JSON.stringify(prefix)} is too long: ` +
        `"${prefix}${LONGEST_BASE_ROLE}" exceeds PostgreSQL's ${MAX_IDENTIFIER_LENGTH}-character ` +
        'identifier limit, past which names are truncated silently.',
    );
  }
  return prefix;
}

export type ManagedRoleNames = Readonly<{
  owner: string;
  writer: string;
  reader: string;
}>;

/** The names this deployment's roles actually carry, prefix applied. */
export function managedRoles(): ManagedRoleNames {
  const prefix = chatSearchRolePrefix();
  return Object.freeze({
    owner: `${prefix}${OWNER_ROLE}`,
    writer: `${prefix}${WRITER_ROLE}`,
    reader: `${prefix}${READER_ROLE}`,
  });
}

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

const READER_SCOPE_QUAL =
  "((tenant_id = NULLIF(current_setting('chat_search.tenant_id'::text, true), ''::text)) AND " +
  "(user_id = NULLIF(current_setting('chat_search.user_id'::text, true), ''::text)))";

type ExpectedPolicy = {
  table: (typeof RLS_TABLES)[number];
  name: string;
  command: string;
  roles: readonly string[];
  using: string;
  withCheck: string | null;
};

/**
 * The complete policy set `003_policies.sql` installs, in the server's own
 * words: the `using`/`withCheck` strings are `pg_get_expr` deparse output, not
 * the SQL source, so the comparison is against what the server will actually
 * evaluate. Deparse output for these constructs is stable across supported
 * PostgreSQL versions; if a future major changes it, the audit fails loudly and
 * these constants get re-captured, which is the failure direction a gate should
 * have. `rls.spec.ts` pins the round trip in 'audits the live policy set, not
 * just the RLS flags'.
 */
function expectedPolicies(names: ManagedRoleNames): readonly ExpectedPolicy[] {
  return RLS_TABLES.flatMap((table) => [
    {
      table,
      name: `${table}_reader_scope`,
      command: 'r',
      roles: [names.reader],
      using: READER_SCOPE_QUAL,
      withCheck: null,
    },
    {
      table,
      name: `${table}_writer_all`,
      command: '*',
      roles: [names.writer],
      using: 'true',
      withCheck: 'true',
    },
  ]);
}

export type RoleViolation = {
  role: string;
  problem: string;
};

/**
 * The role-separation gate, expressed as a query rather than a checklist: every
 * application role holds exactly the attributes `002_roles.sql` asserts — LOGIN
 * and none of SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB — every relation in the
 * schema is owned by the migration owner, the request reader holds nothing beyond `SELECT`
 * on the two serving tables, those two tables have RLS both enabled and forced,
 * and the policies on them are exactly the set `003_policies.sql` installs —
 * name, command, roles, and predicate. The last check exists because permissive
 * policies combine with OR: a single extra `USING (true)` policy for the reader
 * would expose every tenant while the flags above still look correct.
 *
 * Both halves of the reader check are derived rather than listed. The relations
 * come from `pg_class` live, so one introduced by a later migration is in scope
 * the moment it exists; the privileges come from `aclexplode` on the relation's
 * own ACL, so a privilege type this file predates is reported without being
 * named here. Grants to `PUBLIC` are read the same way, since a `PUBLIC` grant
 * reaches the reader like any other.
 *
 * Grants and policies are all it reads. A privilege the reader could reach by `SET ROLE`,
 * because someone made it a member of another role, is not covered here.
 */
export async function findRoleViolations(
  pool: SearchPool,
  roles?: readonly string[],
): Promise<readonly RoleViolation[]> {
  const names = managedRoles();
  const audited = roles ?? [names.owner, names.writer, names.reader];
  const violations: RoleViolation[] = [];

  /**
   * Every attribute `002_roles.sql` asserts is re-read here, not only the two
   * superuser-shaped ones. CREATEROLE matters as much as BYPASSRLS: a role
   * holding it can `ALTER ROLE chat_search_writer PASSWORD ...` and then log in
   * with the writer's cross-tenant reach, so drift on any of the five is a
   * violation. The `roles` parameter exists for the drift tests, which flip
   * attributes on throwaway roles — the managed names are cluster-global, and
   * flipping them live would race every parallel suite's clean-gate assertion.
   */
  const { rows: roleRows } = await pool.query<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolcanlogin: boolean;
  }>(
    `SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
       FROM pg_roles WHERE rolname = ANY($1::text[])`,
    [[...audited]],
  );

  const seen = new Set<string>();
  for (const row of roleRows) {
    seen.add(row.rolname);
    if (row.rolsuper) {
      violations.push({ role: row.rolname, problem: 'is SUPERUSER' });
    }
    if (row.rolbypassrls) {
      violations.push({ role: row.rolname, problem: 'has BYPASSRLS' });
    }
    if (row.rolcreaterole) {
      violations.push({ role: row.rolname, problem: 'has CREATEROLE' });
    }
    if (row.rolcreatedb) {
      violations.push({ role: row.rolname, problem: 'has CREATEDB' });
    }
    if (!row.rolcanlogin) {
      violations.push({ role: row.rolname, problem: 'cannot LOGIN' });
    }
  }
  for (const role of audited) {
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
    if (row.owner !== names.owner) {
      violations.push({
        role: row.owner,
        problem: `owns chat_search.${row.relname} (must be ${names.owner})`,
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
    [[...GRANTABLE_RELKINDS], names.reader, [...READER_SERVING_TABLES]],
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
      violations.push({
        role: names.owner,
        problem: `chat_search.${row.relname} has RLS disabled`,
      });
    }
    if (!row.relforcerowsecurity) {
      violations.push({
        role: names.owner,
        problem: `chat_search.${row.relname} does not FORCE RLS`,
      });
    }
  }
  for (const table of RLS_TABLES) {
    if (!rlsSeen.has(table)) {
      violations.push({ role: names.owner, problem: `chat_search.${table} is missing` });
    }
  }

  const { rows: policyRows } = await pool.query<{
    relname: string;
    polname: string;
    polcmd: string;
    polpermissive: boolean;
    roles: string[];
    using_expr: string | null;
    check_expr: string | null;
  }>(
    `SELECT c.relname, p.polname, p.polcmd, p.polpermissive,
            ARRAY(SELECT CASE WHEN r = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(r)::text END
                    FROM unnest(p.polroles) AS r ORDER BY 1)::text[] AS roles,
            pg_get_expr(p.polqual, p.polrelid) AS using_expr,
            pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'chat_search'
      ORDER BY c.relname, p.polname`,
  );
  const expected = expectedPolicies(names);
  const expectedByKey = new Map(expected.map((p) => [`${p.table}.${p.name}`, p]));
  const seenPolicies = new Set<string>();
  for (const row of policyRows) {
    const key = `${row.relname}.${row.polname}`;
    seenPolicies.add(key);
    const expected = expectedByKey.get(key);
    if (!expected) {
      violations.push({
        role: row.roles.join(', ') || 'PUBLIC',
        problem: `is reachable through unexpected policy ${row.polname} on chat_search.${row.relname}`,
      });
      continue;
    }
    const drift: string[] = [];
    if (!row.polpermissive) {
      drift.push('is RESTRICTIVE (expected PERMISSIVE)');
    }
    if (row.polcmd !== expected.command) {
      drift.push(`applies to command '${row.polcmd}' (expected '${expected.command}')`);
    }
    if (row.roles.join(',') !== expected.roles.join(',')) {
      drift.push(
        `is granted to {${row.roles.join(', ')}} (expected {${expected.roles.join(', ')}})`,
      );
    }
    if (row.using_expr !== expected.using) {
      drift.push(`has USING ${row.using_expr ?? 'NULL'} (expected ${expected.using})`);
    }
    if (row.check_expr !== expected.withCheck) {
      drift.push(
        `has WITH CHECK ${row.check_expr ?? 'NULL'} (expected ${expected.withCheck ?? 'NULL'})`,
      );
    }
    for (const problem of drift) {
      violations.push({ role: names.owner, problem: `policy ${key} ${problem}` });
    }
  }
  for (const policy of expected) {
    const key = `${policy.table}.${policy.name}`;
    if (rlsSeen.has(policy.table) && !seenPolicies.has(key)) {
      violations.push({ role: names.owner, problem: `policy ${key} is missing` });
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

export type RuntimeRoleSlot = 'reader' | 'writer';

/**
 * Boot-time check that a runtime connection string names the role its slot is
 * built around, because the failure modes of a mismatch are quiet. A reader
 * pool connected as an unrelated role fails closed under FORCE RLS — search is
 * enabled and permanently empty, with nothing naming the cause. Connected as
 * this deployment's *writer* it still returns correctly scoped rows (the query
 * predicates scope independently), but the row-security layer beneath them is
 * silently gone; connected as the owner, a DDL-only role is suddenly on a
 * request path. Naming one of our own roles in the wrong slot is therefore an
 * error; an unknown name is only a warning, since PostgreSQL applies a policy
 * to members of its role and a deployment may legitimately connect through a
 * membership. A URL that carries no username (PG* environment variables,
 * .pgpass) is left for the server to resolve. `migrate.spec.ts` pins each
 * branch in the 'runtime role URLs' suite.
 */
export function assertManagedRoleUrl(
  envKey: string,
  connectionString: string,
  slot: RuntimeRoleSlot,
): void {
  let username: string;
  try {
    username = decodeURIComponent(new URL(connectionString).username);
  } catch {
    return;
  }
  if (username === '') {
    return;
  }
  const names = managedRoles();
  const expected = slot === 'reader' ? names.reader : names.writer;
  if (username === expected) {
    return;
  }
  if ([names.owner, names.writer, names.reader].includes(username)) {
    throw new Error(
      `[chatSearch] ${envKey} connects as ${username}, which is this deployment's ` +
        `${username === names.owner ? 'DDL owner' : 'other runtime'} role — the ${slot} slot ` +
        `must connect as ${expected}. Each URL names its own role; that separation is the ` +
        'isolation, not a label on it.',
    );
  }
  logger.warn(
    `[chatSearch] ${envKey} connects as ${username}, not ${expected}. If ${username} is a ` +
      `member of ${expected} this works — row-security policies apply to members — otherwise ` +
      'expect permission failures or empty results from this connection.',
  );
}
