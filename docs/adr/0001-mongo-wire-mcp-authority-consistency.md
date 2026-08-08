# ADR 0001: Use One Mongo-Wire MCP Authority Consistency Protocol

- Status: Accepted
- Date: 2026-08-07

## Context

MCP authority decisions combine principal, role, group, configuration, server, agent, ACL, credential, and OAuth state. LibreChat must make the same safe decision on native MongoDB, Amazon DocumentDB, Azure Cosmos DB for MongoDB, and FerretDB without maintaining provider-specific authority implementations.

The normalized authority data spans multiple collections. Plain sequential reads can observe a mixed state when an authority mutation interleaves with proof construction. Multi-document transactions solve that problem on some engines, but they are unavailable or operationally disruptive on other supported Mongo-wire deployments.

## Decision

LibreChat will use one Mongo-wire MCP authority consistency Module.

The Module owns one global MCP authority fence document. An authority mutation atomically acquires the clean fence, marks it dirty with an owner identifier, performs the mutation, and atomically publishes a new clean generation. Only the recorded owner may publish that generation.

Proof construction reads a clean generation, performs its bounded authority reads, and reads the fence again. It succeeds only when both reads observe the same clean generation. Proofs carry that generation, and every authority-dependent effect asserts that the generation remains current immediately before the effect.

The Implementation uses only atomic single-document `findOneAndUpdate` operations and bounded Mongo reads. Native MongoDB is the canonical engine. Amazon DocumentDB, Azure Cosmos DB for MongoDB, and FerretDB must pass the same Mongo-wire conformance suite; they do not receive separate authority Adapters. FerretDB is accessed through Mongo wire rather than a direct PostgreSQL authority path.

Authority reads must target the writer or primary with a consistency level that returns the latest committed state. Azure Cosmos DB for MongoDB therefore requires account-level Strong consistency for MCP authority work. A deployment that cannot meet the contract enters MCP unavailable state instead of weakening authorization.

A crashed or uncertain mutation leaves the fence dirty. The Module never steals an expired owner lease automatically. Reconciliation is explicit and must establish that the old writer cannot resume before publishing a new generation.

## Consequences

- Standalone MongoDB no longer requires conversion to a replica set for MCP authority consistency.
- MCP authority behavior has one Implementation and one conformance test surface across supported Mongo-wire engines.
- Authority mutations are globally serialized initially, and any mutation invalidates all outstanding MCP authority proofs.
- Every authority writer, including migrations and bulk or administrative paths, must use the Module. Direct database changes are outside the supported consistency contract.
- MCP operations fail closed while a mutation or reconciliation is active; unrelated LibreChat operation remains available.
- Physical TTL cleanup must be authority-neutral because logical expiry is enforced when proofs are resolved and asserted.
- The default-Compose replica-set migration in PR #14696 is not a prerequisite for MCP authority correctness.
