# ADR-0001: Artifact Version Snapshot Storage

- Status: Accepted
- Scope: WP1–WP4 (persistence, publishing, versioning)
- Related: PLAN.md §4, §6.2, §7, §17

## Context

An Artifact App must keep working unchanged after its source conversation or
message is deleted or edited (PLAN §2, §4). Conversation/message/artifact IDs are
"origin metadata only, never a runtime dependency" (PLAN §4). Published versions
must be immutable (PLAN §4, §7). We must decide how the artifact source is stored
per version.

Options considered:

1. **Reference the source message/artifact at render time.** Rejected — violates
   the independence requirement; deleting the conversation breaks the app.
2. **Store a full, self-contained snapshot inline on each `ArtifactVersion`.**
3. **Store snapshots in external object storage (S3/GridFS), referenced by hash.**

## Decision

Store a **full inline snapshot** on each `ArtifactVersion` document:

- `sourceSnapshot: string` — the complete, normalized artifact source (the code /
  markup / mermaid text). No reference back to the message is required to render.
- `artifactType: 'react' | 'html' | 'mermaid'` — the normalized runtime type.
- `runtimeConfig` — `{ dependencies?, entryPoint?, renderMode? }` captured at
  publish time so the renderer is reproducible from the version alone.
- `integrity.sourceHash` — **SHA-256** hex digest computed over a canonical
  serialization of `{ artifactType, sourceSnapshot, runtimeConfig }`. This makes
  the snapshot reproducible/verifiable (PLAN §17 "source hash is reproducible")
  and lets us detect tampering.
- `integrity.schemaVersion` — snapshot format version for forward migration.

Immutability is enforced at the schema level: once a version's
`publication.state` is `released`, the content fields (`sourceSnapshot`,
`artifactType`, `runtimeConfig`, `integrity`, `versionNumber`) can never be
mutated (pre-update/save guards + method-level checks). New content always
creates a **new version**; rollback only flips the App's `activeVersionId`.

### Why inline (option 2) over external storage (option 3)

- Artifact sources are small text blobs (react/html/mermaid), comfortably within
  Mongo document limits; a dedicated object store adds operational complexity and
  a second failure/consistency domain for no benefit at v1 sizes.
- Atomic App + Version-1 creation (PLAN §8.1 step 7) is a single transaction in
  one database; splitting content into object storage would break atomicity or
  require a saga.
- The integrity hash already provides tamper-evidence; external storage would
  still need the same hash.

If artifact sizes grow (e.g. bundled assets in a later WP), the `runtimeConfig`
+ `integrity` split leaves room to move large blobs behind a content-addressed
pointer without changing the App/Version contract.

## Consequences

- `ArtifactApp` and `ArtifactVersion` are separate collections; the App holds
  lifecycle/ACL/marketplace metadata and points to an `activeVersionId`.
- Creation of App + Version 1 is atomic (transaction when the MongoDB deployment
  supports it; sequential-with-compensation fallback otherwise).
- Deleting/editing the source conversation has zero effect on any version
  (verified by WP3 "snapshot independence" tests).
- Tenant isolation applies to both collections; every query is tenant-scoped.
</content>
