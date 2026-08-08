# MCP authority proof rollout

This module backs the mandatory scoped MCP catalog, OAuth, connection, and tool-call fences. The
application creates one `MCPAuthorityProofResolver` per immutable
boot configuration, resolves selected servers into an authority proof, and carries that proof with
the parsed configuration and schemas. Fence helpers accept only the resolution envelope issued by
that resolver, verify its artifact revision, and pass that exact envelope to the publication,
binding, or execution callback. They do not accept a detached proof with arbitrary artifacts, and
the resolver never freezes or otherwise mutates caller-owned config and schema objects.

Every selected target must carry the source generation captured by the parser that produced its
resolved config. Database targets use `createMCPAuthorityDatabaseSourceRevision`; config targets use
`createMCPAuthorityConfigSourceRevision` with the boot digest and the parser's complete applicable
Config document set, including inactive documents. Targets also carry the exact credential revision
from `createMCPAuthorityCredentialRevision` and the expected OAuth `credential_set_id` generation
(or `null`). The consistency-fenced resolve rejects when any generation is no longer current,
closing
the parse-before-proof and credential-rotation windows. `calculateArtifactRevision` must canonically
cover the actual parsed config and schema identities; the resolver combines it with target names,
source generations, config digests, credential fields, and OAuth requirements, then checks it on
both sides of every awaited final assertion. This callback exists because real parsed tool
artifacts can contain functions and class instances that a generic JSON hasher cannot safely
canonicalize.

The boot digest is computed once by the resolver constructor. A current-authority assertion never
reloads YAML, calls the MCP registry, scans Redis, initializes a server, or performs network I/O.
Proof reads use bounded Mongo-wire queries bracketed by the global authority generation. A proof is
accepted only when both fence reads observe the same clean generation. Every authority-effective
writer owns that fence from before its first write until its last write completes; nested mutations
coalesce under the same owner. Concurrent writers wait for a bounded interval. A failed or crashed
writer deliberately leaves the fence dirty, which disables MCP authority reads and later writes
until an operator reconciles the interrupted mutation. The application itself remains available.

This protocol does not require multi-document transactions, a replica set, or provider-specific
authority adapters. Native MongoDB is the reference engine. Amazon DocumentDB, Azure Cosmos DB for
MongoDB, and FerretDB must qualify through the same Mongo-wire conformance suite. Cosmos deployments
must use account-level Strong consistency; weaker consistency levels cannot satisfy the fence
contract and therefore leave MCP unavailable.

## Integration fences

The application uses the substrate at these final side-effect boundaries:

- Use `publishWithCurrentAuthority` immediately around catalog, schema, HTTP response, and binding
  publication callbacks.
- Use `executeWithCurrentAuthority` around the remote `tools/call` callback, after connection,
  OAuth, Graph, and OBO work. The optional `beforeExecute` hook exists for deterministic race tests;
  the authoritative assertion runs after the hook and immediately before the callback.
- OAuth callback integration must assert before token exchange. After exact-generation storage,
  re-resolve a new proof bound to that stored generation, then assert the new proof immediately
  before waking waiters. The pre-store proof is expected to reject once the grant exists and must
  never be reused. If re-resolution or the post-store assertion rejects, delete only the credential
  generation written by that callback.
- Validate that the route server name, parsed flow-id server name, and stored flow-state server name
  are identical before resolving or asserting a proof.

Constructing the resolver is not sufficient: the caller must carry the same issued resolution
envelope through each final fence.

Before deploying this integration, quiesce MCP server writes and run
`npm run migrate:mcp-authority`. Resolve every normalized-name collision reported by the command
before retrying. Use `npm run migrate:mcp-authority:check` for a read-only readiness check. Startup
performs the same schema check and leaves MCP unavailable with the migration command when normalized
names or required indexes are not ready. Migration writes are offline rollout steps and are never
invoked by a hot proof path or automatically at startup.

## Observability

`MCPAuthorityProofError.reason` is a bounded rejection code suitable for a counter or structured
log field. Log the reason, fence name, and optional server name. Do not log the proof, resolved
configuration, credential digests, OAuth generation, user source identifiers, or underlying query
error. Unexpected database and malformed-record failures are normalized to `proof_unavailable` so
the path fails closed without exposing stored data.
