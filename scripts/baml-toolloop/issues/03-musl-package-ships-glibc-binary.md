# READY TO FILE — boundaryml/baml

Use the 🐞 Bug Report template. Field values are at the bottom.

**Title:** `[bug] @boundaryml/baml-bridge-linux-x64-musl ships a glibc binary — addon fails to load on Alpine`

---

### Describe the bug

The published `@boundaryml/baml-bridge-linux-x64-musl` package contains a
**glibc-linked** `.node` addon under a musl filename. On any musl host (Alpine)
the correct optional dependency is installed and platform detection picks it
correctly, but the addon cannot be loaded.

The failure surfaces through napi's fallback message, which is misleading:

```
Cannot find native binding.
  npm has a bug related to optional dependencies ...
```

That sends you looking for an npm optional-dependency resolution problem, which
is not what is happening. A direct `require()` of the addon gives the real error:

```
Error loading shared library ld-linux-x86-64.so.2: No such file or directory
```

`ld-linux-x86-64.so.2` is the **glibc** dynamic loader. It does not exist on
Alpine.

Reading the ELF headers of the published artifact confirms it:

```console
$ npm pack @boundaryml/baml-bridge-linux-x64-musl@0.15.0
$ tar -xzf boundaryml-baml-bridge-linux-x64-musl-0.15.0.tgz
$ readelf -d package/baml_node.linux-x64-musl.node | grep NEEDED
 0x0000000000000001 (NEEDED)  Shared library: [libgcc_s.so.1]
 0x0000000000000001 (NEEDED)  Shared library: [libc.so.6]
 0x0000000000000001 (NEEDED)  Shared library: [ld-linux-x86-64.so.2]

$ readelf -V package/baml_node.linux-x64-musl.node | grep -oE 'GLIBC_[0-9.]+' | sort -uV | tail -3
GLIBC_2.30
GLIBC_2.33
GLIBC_2.34
```

A genuine musl build links `libc.musl-x86-64.so.1` and carries **no** `GLIBC_*`
versioned symbols.

**It is not a copy of the gnu artifact** — the two binaries differ, so this looks
like the musl build matrix leg compiling against glibc rather than a
publish-time file mixup:

```
musl-named  sha256 41d4c751ab78258a756ad29bd77361c4b4fc7b9b5f631c1eb100ad40677da2a9
gnu         sha256 a34f464249f6a49036d267f9ae61c97ee93c6ee8d8127b08517e236cae6347a9
```

**Still present on the newest published build.**
`@boundaryml/baml-bridge-linux-x64-musl@0.15.1-nightly.20260809.a` has the
identical glibc `NEEDED` set, so there is no version to upgrade to.

### Reproduction Steps

On any musl host — `node:22-alpine` reproduces it:

```dockerfile
FROM node:22-alpine
RUN npm install @boundaryml/baml-bridge@0.15.0
RUN node -e "require('@boundaryml/baml-bridge')"
# → Cannot find native binding. npm has a bug related to optional dependencies...
```

To see the real cause rather than the napi fallback, require the addon directly:

```sh
node -e "require('/app/node_modules/@boundaryml/baml-bridge-linux-x64-musl/baml_node.linux-x64-musl.node')"
# → Error loading shared library ld-linux-x86-64.so.2: No such file or directory
```

Platform-independent check — no Alpine needed, the published artifact is enough:

```sh
npm pack @boundaryml/baml-bridge-linux-x64-musl@0.15.0
tar -xzf boundaryml-baml-bridge-linux-x64-musl-0.15.0.tgz
readelf -d package/*.node | grep NEEDED     # shows libc.so.6, ld-linux-x86-64.so.2
```

### Expected

The `linux-x64-musl` artifact links `libc.musl-x86-64.so.1`, carries no
`GLIBC_*` versioned symbols, and loads on a stock Alpine image with no
compatibility shim.

### Actual

A glibc binary published under the musl name. It cannot load on Alpine, and the
error message points at npm rather than at the binary.

### Workaround

`apk add gcompat` installs a partial glibc ABI shim that provides
`ld-linux-x86-64.so.2`, after which the addon loads. **This is not a safe
long-term fix**: the binary requires symbols up to `GLIBC_2.34` (the release
that folded `libpthread`/`libdl` into `libc`), and gcompat does not implement
all of glibc. It can load successfully and still fail on an unexercised code
path. Using a glibc base image (`node:22-slim`) avoids the problem entirely.

### Suggested fix

Build the musl leg in a musl toolchain
(`x86_64-unknown-linux-musl` with a musl sysroot, e.g. the standard
`rust-musl-cross` / Alpine builder), and add a CI gate that fails the release if
the musl artifact reports any `GLIBC_*` versioned symbol:

```sh
readelf -V "$artifact" | grep -q 'GLIBC_' && { echo "musl artifact is glibc-linked"; exit 1; }
```

That check is one line and would have caught this before publish.

### Possibly related

#4279 — `baml pack --target *-unknown-linux-musl` always fails. Different
symptom (packing, not loading), but also musl-target-specific, so the two may
share a build-configuration root cause.

### Impact

Blocks any Alpine-based deployment of a Node service that uses BAML. Alpine is
the default base image for a large share of Node containers, and the misleading
npm error costs real debugging time before anyone thinks to check the ELF
headers.

---

## Template field values

| Field | Value |
|---|---|
| Product | BAML |
| BAML Version | `0.15.0` (bridge); also `0.15.1-nightly.20260809.a` |
| Language/Framework | Node.js |
| LLM Provider | Other (not provider-specific) |
| LLM Model | n/a — fails at module load, before any LLM call |
| Operating System | Linux (Alpine / musl) |
| Browser | Other |
| Code Editor | VS Code |
