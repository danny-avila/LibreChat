# BSON legibility spike — findings (Spike A executed, Spike B scoped)

Executed 2026-08-02 against `ghcr.io/ferretdb/postgres-documentdb:17-0.107.0-ferretdb-2.7.0`
(PostgreSQL 17.6, `documentdb` / `documentdb_core` 0.107-0) + `ghcr.io/ferretdb/ferretdb:2.7.0`,
driven through the real `mongodb` Node driver. Full accessor inventory (exit criterion 1) is in
[bson-inventory.txt](./bson-inventory.txt) — 467 lines, pasted verbatim from `pg_proc`.

## Verdict

**Spike A passes on every gate: A1, A3, A4, and A5 all pass.** Typed generated columns and a
whole-document `jsonb` projection both work, and DocumentDB/FerretDB is completely indifferent
to the extra columns.

**Spike B remains open** (needs a managed PG18 + ClickPipes pipe, not provisionable locally),
but two local findings change its framing:

1. **No PG18 build of the DocumentDB extension exists.** ghcr tags for
   `ferretdb/postgres-documentdb` cover PG 15/16/17 only (checked live 2026-08-02; upstream
   `microsoft/documentdb` unverified — GitHub API rate-limited). `publish_generated_columns`
   is PG18-only, so **Option 1 cannot be deployed on a DocumentDB Postgres today even if
   ClickPipes supports the parameter.** The B probe is still worth running to know whether
   Option 1 becomes available when a PG18 extension build lands, but it no longer gates the
   mechanism choice.
2. **STORED generated-column values are already materialized in WAL tuples on PG17** —
   `test_decoding` prints them. The pre-18 limitation lives purely in the `pgoutput`
   publication layer that ClickPipes/PeerDB consumes. The data is there; the protocol drops it.

**Matrix position: Option 2 — trigger-maintained plain columns.** Proven end-to-end locally:
a plain column maintained by a `BEFORE INSERT OR UPDATE` row trigger fires correctly on
FerretDB's write path and its values flow through logical decoding on stock PG17. Option 1
becomes an upgrade path if/when DocumentDB ships PG18 *and* the B probe passes.

## A1 — accessor surface (pass)

Immutable paths out of `documentdb_core.bson` exist for every target we need:

| Function | Signature | Volatility | Notes |
|---|---|---|---|
| `documentdb_core.bson_get_value_text` | `(bson, text) → text` | **IMMUTABLE** | The `->>` operator. Dotted paths work (`'meta.model'`). |
| `documentdb_core.bson_get_value` | `(bson, text) → bson` | **IMMUTABLE** | The `->` operator. |
| `documentdb_core.bson_to_json_string` | `(bson) → cstring` | **IMMUTABLE** | Whole document as canonical Extended JSON; `::text::jsonb` composes and stays immutable-safe. |
| `documentdb_core.bson_json_to_bson` | `(text) → bson` | IMMUTABLE | Reverse direction, useful for tests. |

Casts registered on the type: only `bytea ↔ bson` (+ `bson → bsonsequence`) — no SQL-type
casts, so the functions above are the whole story. All 72 operators on the type are
IMMUTABLE; the only non-immutable bson functions in the extension are aggregate transition
helpers (STABLE) and two GiST distance functions (VOLATILE), none of which matter here.
Note the operators live in `documentdb_core`/`documentdb_api_catalog`, not on the default
`search_path` — use schema-qualified function calls in DDL.

### Accessor semantics — the quirks that decide the recipes

- `bson_get_value_text` returns **JSON-flavored text, not raw values**: strings arrive
  wrapped in quotes and inner quotes are *not* escaped (`"Ünïcödé & "quotes" test"`), so its
  string output is neither the raw string nor valid JSON. Numbers arrive clean (`12`).
  Dates/ObjectIds arrive as EJSON fragments (`{ "$date" : "2026-08-01T10:00:00Z" }`).
- `bson_to_json_string` escapes correctly (the same title round-trips through `::jsonb`
  perfectly), and emits **canonical** EJSON: `{"$numberInt": "12"}`,
  `{"$date": {"$numberLong": "1785578400000"}}`, `{"$oid": "..."}`.
- Missing field → SQL `NULL`; BSON `null` → the string `null`. Distinguishable, but remember it.
- `text::timestamptz` is STABLE (GUC-dependent), so a direct `timestamptz` generated column
  is rejected by Postgres — exactly the silent-corruption trap the handoff flagged. Project
  epoch millis as `bigint` (canonical `$date.$numberLong` via jsonb path ops, all immutable)
  and type it on the ClickHouse side.

**Recipes:** numbers → `bson_get_value_text(document, 'field')::bigint`. Strings and
everything else → project `doc_json jsonb` once via `bson_to_json_string(document)::text::jsonb`
and extract with plain jsonb operators (in Postgres or in ClickHouse).

## A2/A3/A5 — projection (pass)

Backing tables are `documentdb_data.documents_<collection_id>`
(`shard_key_value bigint, object_id bson, document bson`, PK on the pair; ids mapped in
`documentdb_api_catalog.collections`; id 1 is a `system.dbSentinel` with a
`disallow_writes_check`). All three column shapes added and backfilled existing rows without error:

```sql
ALTER TABLE documentdb_data.documents_2
  ADD COLUMN conversation_id text   GENERATED ALWAYS AS (documentdb_core.bson_get_value_text(document, 'conversationId')) STORED,
  ADD COLUMN message_count   bigint GENERATED ALWAYS AS ((documentdb_core.bson_get_value_text(document, 'messageCount'))::bigint) STORED,
  ADD COLUMN doc_json        jsonb  GENERATED ALWAYS AS (documentdb_core.bson_to_json_string(document)::text::jsonb) STORED;
```

## A4 — DocumentDB still works (pass, 14/14)

Through FerretDB against the modified table: `insertOne`, `insertMany`, `updateOne $set`,
`updateOne $inc`, `replaceOne`, filtered `find`, `$group` aggregate, `createIndex`,
indexed `findOne`, `dropIndex`, **unique** `createIndex`, unique-violation rejection
(proper `E11000`, code 11000), `deleteOne`, collection `drop` (table removed cleanly,
projections and all). Generated columns recomputed correctly after every write shape
($inc 12→17, $set →99, replace →7). No errors, no warnings in server logs.

## New collections — event trigger works (exit criterion 4)

A `ddl_command_end` event trigger filtering `CREATE TABLE` on
`documentdb_data.documents_%` successfully `ALTER TABLE`-ed a projection onto a collection
created *implicitly by a FerretDB insert*, inside DocumentDB's own create path, and the
insert succeeded. **Event trigger suffices; no `pg_cron` sweep needed** (a periodic
reconciliation sweep is still cheap insurance). Caveat for managed Postgres: creating event
triggers needs superuser-ish privilege — verify on the ClickHouse-managed instance.

## Write amplification (exit criterion 4)

Interleaved `insertMany` rounds of 1000 × ~1KB docs, 5 rounds each, medians:

| Configuration | ms / 1000 docs | Overhead |
|---|---|---|
| No projections | 18 | — |
| 3 scalar generated columns | 18 | **unmeasurable** |
| + whole-doc `jsonb` projection | 48 | ~2.8× batch path (~30µs/doc) |

Storage at 6000 docs: 9.9MB → 12MB with the jsonb projection (+21%; TOAST compresses the
EJSON well). Scalar projections are free; the jsonb copy costs real but modest write CPU
and ~a fifth more disk. Per-request in production, ~30µs/doc is noise next to network RTT.

## CDC evidence gathered locally

- `test_decoding` on PG17: the plain trigger-maintained column carries its value on both
  INSERT and UPDATE from FerretDB; the generated `jsonb` column's value is present in the
  WAL tuple; the raw `document` column decodes as `BSONHEX<hex>` — confirming the premise
  that the blob is opaque to any downstream consumer.
- `CREATE PUBLICATION` works on collection tables, both `FOR TABLE` and
  `FOR TABLES IN SCHEMA documentdb_data`.
- The PK includes `object_id documentdb_core.bson` — a custom-type key column. Whether
  ClickPipes handles custom types (as their text representation or at all) is a real
  question for the B probe; Option 3's projection tables sidestep it entirely with a clean
  typed PK.

## What remains for Spike B (unchanged, plus one addition)

The handoff's B probe stands as written (managed PG18, `cdc_gencol_probe`,
`publish_generated_columns = stored`, direct connection not PgBouncer, watch for
ClickPipes building its own publication). Add one check: point a pipe at a table with a
`documentdb_core.bson`-typed column — or any custom type — and observe how ClickPipes maps
it, since that decides whether Option 2 can replicate the raw tables directly or Option 3's
projection tables are required.

## Recommendation

Proceed on **Option 2 mechanics**: plain columns + `BEFORE INSERT OR UPDATE` row triggers
(the trigger body is three lines; scalar maintenance cost is unmeasurable). Choose between
Option 2 and Option 3 based on the ClickPipes custom-type answer from the B probe — if
ClickPipes chokes on `bson`-typed columns, projection tables (Option 3) become the
replication surface and DocumentDB's tables stay untouched, which the handoff already
called the more robust design. The DocumentDB-extension ask can now carry a concrete
finding: the mechanism is proven, PG17 is sufficient, and no PG18 feature is required.
