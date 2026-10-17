import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pagesRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(pagesRoot, '..');
const clientDist = path.join(repoRoot, 'client', 'dist');
const pagesDist = path.join(pagesRoot, 'dist');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args, { production = false } = {}) {
  const env = { ...process.env };
  if (production) env.NODE_ENV = 'production';
  else delete env.NODE_ENV;

  execFileSync(npm, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
}

// Cloudflare Pages still uses /meo-pages as its root so the existing
// Pages Functions under meo-pages/functions keep handling browser OAuth.
// The static application, however, is now built exclusively from client/.
// Build tooling is intentionally installed even though the final bundle is
// production output; packages such as tsdown and Vite are devDependencies.
run(['ci', '--include=dev']);
run(['run', 'build:data-provider'], { production: true });
run(['run', 'build:client-package'], { production: true });
run(['run', 'build:client'], { production: true });

await access(path.join(clientDist, 'index.html'));
await rm(pagesDist, { recursive: true, force: true });
await mkdir(pagesDist, { recursive: true });
await cp(clientDist, pagesDist, { recursive: true });

console.log('Built the canonical React Meo AI Web into meo-pages/dist.');
