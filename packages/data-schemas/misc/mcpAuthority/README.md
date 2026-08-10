# MCP authority Mongo-wire conformance

This directory contains one provider-neutral authority contract. It uses only the Mongo wire path
used by LibreChat in production. The same tests cover the schema migration, global generation
fence, bounded nine-collection proof, dirty-state rejection, and post-mutation invalidation.

Run the native MongoDB reference with an ephemeral standalone server:

```sh
npx jest --config misc/mcpAuthority/jest.mongo-wire.config.mjs
```

Run a dedicated external test database by supplying its normal Mongo connection string:

```sh
MCP_AUTHORITY_MONGO_WIRE_URI='mongodb://...' \
MCP_AUTHORITY_MONGO_WIRE_PROVIDER='amazon-documentdb' \
npx jest --config misc/mcpAuthority/jest.mongo-wire.config.mjs
```

Supported provider labels are `native-mongodb`, `amazon-documentdb`, `azure-cosmos-mongodb`, and
`ferretdb`. Azure Cosmos DB must use account-level Strong consistency and additionally requires
`MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED=true`. That acknowledgement is deliberately not
an automatic capability guess: weaker Cosmos consistency cannot establish the cross-collection
ordering required by the fence.

Use a dedicated database. The harness creates the required collections and indexes, writes
run-scoped fixtures, and removes only those fixtures. It leaves the migrated collections and
indexes in place so operators can inspect them after a failure.
