/**
 * `undici` (transitive dep of `@librechat/agents` and others) references
 * `globalThis.File` from `node:buffer`. Node 20+ exposes it as a global;
 * Node 18 / certain WSL toolchains do not, which surfaces as a
 * `ReferenceError: File is not defined` at module-load time the first
 * time a test imports `@librechat/agents`. Jest under those Node
 * versions blows up before the suite can even start.
 *
 * Pull `File` from `node:buffer` (available since Node 18.x) and assign
 * it onto `globalThis` if missing. Production code never depends on
 * this — the polyfill only activates inside Jest.
 */
if (typeof globalThis.File === 'undefined') {
  try {
    const { File } = require('node:buffer');
    if (File != null) {
      globalThis.File = File;
    }
  } catch {
    // Older Node versions without `node:buffer.File`. LibreChat doesn't
    // support those anyway; let the test fail loudly rather than mask a
    // real environment issue.
  }
}
