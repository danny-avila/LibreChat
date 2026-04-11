/**
 * Pre-install LadybugDB extensions (FTS + vector) into the Docker image's
 * extension cache (~/.kuzu/extension/). Without this, gitnexus serve's
 * lbug-adapter calls LOAD EXTENSION fts at runtime but fails silently
 * because the extension was never installed, causing all BM25 and
 * semantic queries via the query() tool to return empty.
 *
 * Workaround for upstream GitNexus 1.5.3 bug where the CI-produced
 * .gitnexus/ artifact doesn't include the extension cache.
 */

const path = require('path');
const fs = require('fs');

// @ladybugdb/core lives under the globally-installed gitnexus package.
// This path is stable across gitnexus versions because npm always nests
// transitive deps under the installed package's node_modules.
const lbugPath = '/usr/local/lib/node_modules/gitnexus/node_modules/@ladybugdb/core';
const lbug = require(lbugPath);

const tmpDir = '/tmp/lbug-ext-install';
fs.mkdirSync(tmpDir, { recursive: true });

// Open a throwaway database just to run INSTALL against. The extension
// cache persists in ~/.kuzu/extension/ regardless of which database was
// used to install it, so the throwaway db and tmpDir are deleted in the
// Dockerfile after this script finishes.
const db = new lbug.Database(path.join(tmpDir, 'db'), 0, false, false);
const conn = new lbug.Connection(db);

(async () => {
  try {
    await conn.query('INSTALL fts');
    console.log('FTS extension installed');
  } catch (err) {
    console.error('FTS install failed:', err.message);
    process.exit(1);
  }
  try {
    await conn.query('INSTALL vector');
    console.log('Vector extension installed');
  } catch (err) {
    console.error('Vector install failed:', err.message);
    process.exit(1);
  }
})();
