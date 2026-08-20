# Chat search stack (local infrastructure)

Docker Compose stack for the PostgreSQL-backed chat search work. Stands up four
services, all isolated from the repo's production compose files:
`ferretdb-postgres`, `ferretdb`, `chat_search_db`, `clickhouse`.

This directory is infrastructure only. It provisions the roles, schema,
extensions and default grants; the tables, policies and indexes come from the
migrations in `packages/api/src/search/migrations`, applied by the runner in
`config/migrate-chat-search.js`.

## Start

```bash
cp search/.env.example search/.env
# fill in every REPLACE_ME_* value - see .env.example for a one-liner using
# `openssl rand` to generate them
cd search
docker compose up -d
./healthcheck.sh        # waits for all 4 services healthy, verifies roles exist
```

Tear down (including volumes - this wipes all local data):

```bash
docker compose -f search/compose.yml down -v
```

## What was verified live (2026-08-07)

The full stack was brought up for real and torn down again afterward:

- All four containers reached Docker `healthy` status from a fresh volume.
- `chat-search-roles.sh` ran cleanly on `chat_search_db` init: `chat_search`
  schema created, all three roles created, zero errors in container logs.
  (That run predates the role-prefix rewrite; the current script text was
  re-verified 2026-08-11 against a real PostgreSQL 17.8 server — fresh-create
  and idempotent re-run paths, prefixed role names, and a SCRAM login as the
  created reader — and CI now executes the script on every PR, twice, in the
  `test-packages-api` job.)
- Role attributes confirmed via `pg_roles`: `chat_search_owner`,
  `chat_search_writer`, `chat_search_reader` are all `rolsuper=f`,
  `rolbypassrls=f`, `rolcreaterole=f`, `rolcreatedb=f`. Only the bootstrap
  admin (`chat_search_admin`, never used by the app) is a superuser.
- **Default-privilege behavior confirmed against a real table**, not just
  read from `pg_default_acl`: created `chat_search.smoke_test(id, v
vector(3))` **as `chat_search_owner`**, then connected directly as
  `chat_search_writer` and did an `INSERT` + a `<=>` cosine-distance
  `SELECT` - both succeeded via the default-privilege grant, no per-table
  `GRANT` needed. Connected directly as `chat_search_reader` and ran
  `SELECT * FROM smoke_test` - got `ERROR: permission denied for table
smoke_test`, confirming deny-by-default.
- `pg_isready` + `SHOW wal_level` on `ferretdb-postgres` returned `logical`.
- ClickHouse `GET /ping` returned `Ok.`.
- FerretDB: full Mongo-wire round trip over `mongodb://$FERRETDB_PG_USER:$FERRETDB_PG_PASSWORD@
localhost:27021/?authMechanism=SCRAM-SHA-256` using the repo's own
  `mongodb` driver - `admin.ping()` returned `{ok:1}`, then `insertOne` /
  `findOne` / `dropDatabase` all round-tripped correctly.

Two things only surfaced at runtime and are fixed in both files:
`ALTER DEFAULT PRIVILEGES ... :'password'` inside a dollar-quoted `DO $$
... $$` block silently fails (`psql` does not interpolate `:'var'` inside
`$$`-quoted text - it passes the literal `:'owner_password'` through to the
server, which errors on `:`). Rewritten using `\gset` + `\if/\else/\endif`
client-side metacommands instead, which interpolate correctly and were
re-verified end to end. Also: granting `USAGE` on a schema is **not**
sufficient for unqualified type names like `vector(1024)` to resolve -
`search_path` has to include `chat_search` on all three roles, or every
statement has to schema-qualify the type. Added `ALTER ROLE ... SET
search_path = chat_search, public` for all three roles.

## Port map

Chosen to conflict with none of the ports already used by the repo's other
compose files. Existing ports (unchanged by this stack):

| Port    | Service                                             | Where                                                             |
| ------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| 3080    | LibreChat API                                       | `docker-compose.yml`, `deploy-compose.yml`                        |
| 80, 443 | nginx client                                        | `deploy-compose.yml`, `utils/docker/test-compose.yml`             |
| 3000    | admin-panel                                         | `docker-compose.yml`, `deploy-compose.yml`                        |
| 27018   | mongodb (optional host expose)                      | `docker-compose.override.yml`, `utils/docker/test-compose.yml`    |
| 7700    | meilisearch                                         | `docker-compose.override.yml`, `utils/docker/test-compose.yml`    |
| 5432    | `vectordb` (pgvector, pg15)                         | `docker-compose.override.yml`                                     |
| 5433    | `vectordb` (pgvector, pg15)                         | `rag.yml`                                                         |
| 8000    | `rag_api` (`RAG_PORT` default)                      | `rag.yml`, `utils/docker/test-compose.yml`                        |
| 27020   | FerretDB differential-test harness (mongo protocol) | `packages/data-schemas/misc/ferretdb/docker-compose.ferretdb.yml` |

New ports, this stack (`search/compose.yml`, all overridable in `search/.env`):

| Port  | Service             | Purpose                                                                   |
| ----- | ------------------- | ------------------------------------------------------------------------- |
| 27021 | `ferretdb`          | Mongo wire protocol - the port LibreChat's Mongo driver would point at    |
| 8089  | `ferretdb`          | FerretDB debug/metrics HTTP (`FERRETDB_DEBUG_ADDR`, container port 8088)  |
| 5434  | `ferretdb-postgres` | Direct SQL access to the DocumentDB backing store (not needed by the app) |
| 5435  | `chat_search_db`    | PostgreSQL 17 + pgvector, the dedicated search store                      |
| 8123  | `clickhouse`        | HTTP interface                                                            |
| 9000  | `clickhouse`        | Native TCP protocol                                                       |

Note: this stack's FerretDB (27021) is a **separate instance** from the
existing differential-test harness's FerretDB (27020,
`packages/data-schemas/misc/ferretdb/docker-compose.ferretdb.yml`). Both can
run at the same time without conflict.

## Credentials

Nothing here uses a default credential. `search/.env.example` documents
every variable; copy it to `search/.env` (already covered by the repo's
`.env*` gitignore rule) and replace the `REPLACE_ME_*` placeholders before
starting.

| Variable                                                        | Used by                                                               | Notes                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FERRETDB_PG_USER` / `FERRETDB_PG_PASSWORD`                     | `ferretdb-postgres` bootstrap, `ferretdb`'s `FERRETDB_POSTGRESQL_URL` | **Required, no default** - compose refuses to start without them. FerretDB 2.x forwards these same credentials to Mongo-wire clients, so this pair is the password for all projected chat content - see "How FerretDB auth works" below. |
| `CHAT_SEARCH_BOOTSTRAP_USER` / `CHAT_SEARCH_BOOTSTRAP_PASSWORD` | `chat_search_db` container bootstrap only                             | Superuser, but never used by the app - interactive/`docker exec` debugging only.                                                                                                                                                         |
| `CHAT_SEARCH_OWNER_PASSWORD`                                    | `chat_search_owner` role                                              | Migration owner. Not superuser; owns the `chat_search` schema and every relation in it.                                                                                                                                                  |
| `CHAT_SEARCH_WRITER_PASSWORD`                                   | `chat_search_writer` role                                             | Projection writer - `CHAT_SEARCH_WRITER_URL`, used by the projector, outbox consumer and sweep, never by a request pod.                                                                                                                  |
| `CHAT_SEARCH_READER_PASSWORD`                                   | `chat_search_reader` role                                             | Forced-RLS request reader - `CHAT_SEARCH_DATABASE_URL`, the only role a request pod holds. `SELECT` on `documents` and `embeddings` and nothing else.                                                                                    |
| `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD`                       | `clickhouse`                                                          | `CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=0` keeps this account from being a de facto admin; an outbox consumer should provision its own scoped user once ingestion lands.                                                                   |

None of the roles this stack creates is a superuser, a `BYPASSRLS` role, or an
owner of anything outside `chat_search` (`chat_search_owner` owns the schema it
migrates). Verified live, see above.

## How FerretDB auth works

FerretDB 2.x does not store credentials itself - it forwards whatever
credentials the Mongo client presents straight to PostgreSQL for validation.
`FERRETDB_POSTGRESQL_URL`'s embedded credentials
are also the credentials Mongo clients authenticate with:
`mongodb://$FERRETDB_PG_USER:$FERRETDB_PG_PASSWORD@localhost:27021/?authMechanism=SCRAM-SHA-256`.
Least-privilege Mongo-facing users for the app itself, rather than this shared
`ferretdb` bootstrap credential, are not something this stack sets up.

## `chat_search_db` roles and grants

`search/init/chat-search-roles.sh` runs once via
`docker-entrypoint-initdb.d` on a fresh volume (or safely re-run by hand -
every statement is idempotent). It creates:

1. The three roles: `chat_search_owner` (migration owner),
   `chat_search_writer` (projection writer), `chat_search_reader`
   (forced-RLS request reader).
2. The `chat_search` schema, owned by `chat_search_owner`.
3. `search_path = chat_search, public` on all three roles, so unqualified
   references (`vector(1024)`, bare table names) resolve without every
   statement having to schema-qualify - `GRANT USAGE ON SCHEMA` alone does
   not make that happen, confirmed the hard way above.
4. The `vector` and `pg_trgm` extensions, installed into `chat_search`
   (pgvector for the embeddings column, pg_trgm for the trigram search arm).
5. `ALTER DEFAULT PRIVILEGES FOR ROLE chat_search_owner IN SCHEMA
chat_search`: a table **created by `chat_search_owner`** automatically
   grants `chat_search_writer` full DML plus sequence usage. Default
   privileges key on the role that runs `CREATE TABLE`, not on the role that
   ends up owning the table, so this entry does not cover a table the
   migration runner creates as the provisioning superuser and hands over
   afterwards - `002_roles.sql` adds a second entry for that creator, which
   is the one the migrations actually rely on.
   No default privilege is granted to `chat_search_reader` at all: PostgreSQL
   grants a new relation to its owner and nobody else, so a table added by a
   later migration starts out closed to the reader without that migration
   issuing a revoke.

Everything else - the tables, the reader's two `SELECT` grants, `FORCE ROW
LEVEL SECURITY` and the tenant/user policies - belongs to the migrations,
because a policy can only be applied to a table that already exists.

To check the result rather than assume it, `findRoleViolations`
(`packages/api/src/search/roles.ts`) enumerates every grantable relation in
`chat_search` from `pg_class` and reports any privilege the reader or `PUBLIC`
holds outside those two `SELECT`s, so a relation a future migration adds is
covered without being named anywhere. `config/migrate-chat-search.js` calls it
last and fails the run over what it finds, so a provisioning run that reports
success is one whose separation held when it finished. It is a check at that
moment rather than a hook - nothing re-runs it in between, so a grant issued by
hand afterwards stands until the next provisioning run.

## How much of a document is indexed

`chat_search.documents` stores `title` and `body` in full and returns them in
full. The _indexes_ over them are bounded, and the bounds are a behavioural
boundary worth knowing about rather than an implementation detail:

| Arm                                      | Column             | Indexed extent           |
| ---------------------------------------- | ------------------ | ------------------------ |
| Full text (`search_vector`, weight A)    | `title`            | first 8,192 characters   |
| Full text (`search_vector`, weight B)    | `body`             | first 192,000 characters |
| Trigram (`documents_title_trgm_idx`)     | `title`            | whole column             |
| Trigram (`documents_body_trgm_idx`)      | `body`             | whole column             |
| Title sort (`documents_scope_title_idx`) | `left(title, 512)` | first 512 characters     |

The two full-text bounds are not tuning. A `tsvector` addresses its lexeme
buffer with a 20-bit offset, so one value's distinct lexemes must fit in
1,048,575 bytes, and `search_vector` is a `STORED` generated column - past
that limit the write itself fails, so an oversized document would stop being
_stored_, not merely stop being _indexed_. 8,192 + 192,000 characters is
800,768 bytes at the widest UTF-8 encoding, about 76% of the limit. The
consequence: a word that appears only beyond that prefix does not match the
full-text arm. It is still reachable through the trigram arms, which index
the whole of both columns.

The title-sort bound is the B-tree index tuple limit (~2,704 bytes, and index
tuples are never moved out of line), which an unbounded `title` can exceed at
roughly 900 CJK characters - inside the 1,024-character cap the rename path
already allows. Because the index is on the expression, a title-sorted query
has to sort by `left(title, 512), record_id` to use it; `ORDER BY title` falls
back to a sequential scan and a sort. `record_id` stays the final tiebreak, so
the order is still total and stable.

## What depends on this stack

- **FerretDB compatibility tests** run against a _separate_ FerretDB instance
  (`packages/data-schemas/misc/ferretdb/docker-compose.ferretdb.yml`, port 27020) - not this one. This stack's `ferretdb` (27021) is the
  application-facing Mongo bridge.
- **`rag_api`** is out of scope for this compose file - `rag.yml` and the root
  compose files already provision `rag_api` + `vectordb` separately.
- **The chat search migrations, projector and query path** are the primary
  consumer: migrations run against `chat_search_db` (port 5435) as an
  administrative connection, the projector and reconciler run as
  `chat_search_writer`, and the request path runs as `chat_search_reader`.
  Their PostgreSQL-backed specs read `CHAT_SEARCH_TEST_URL`.
- **ClickHouse work** consumes this stack's `clickhouse` service (ports
  8123/9000).
- A logical-decoding CDC experiment needs `wal_level=logical` on
  `ferretdb-postgres`, which is already set here (`postgres -c
wal_level=logical`) even though nothing in this stack consumes it yet.

## Not configured here

- ClickHouse `system.query_log` and PostgreSQL statement logging are not
  configured, so there is no query-level audit trail in this stack.
- No TLS between the app and any of these services - fine for local work, not
  for a shared environment.
- `rag_api`'s connection to `vectordb` still uses that stack's bootstrap
  superuser; this stack does not touch `vectordb` at all, by design.
