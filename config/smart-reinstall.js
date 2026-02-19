#!/usr/bin/env node
/**
 * Smart Reinstall for LibreChat
 *
 * Combines cached dependency installation with Turborepo-powered builds.
 *
 * Dependencies (npm ci):
 *   Hashes package-lock.json and stores a marker in node_modules.
 *   Skips npm ci entirely when the lockfile hasn't changed.
 *
 * Package builds (Turborepo):
 *   Turbo hashes each package's source/config inputs, caches build
 *   outputs (dist/), and restores from cache when inputs match.
 *   Turbo v2 uses a global cache (~/.cache/turbo) that survives
 *   npm ci and is shared across worktrees.
 *
 * Usage:
 *   npm run smart-reinstall                  # Smart cached mode
 *   npm run smart-reinstall -- --force       # Full clean reinstall, bust all caches
 *   npm run smart-reinstall -- --skip-client # Skip frontend (Vite) build
 *   npm run smart-reinstall -- --clean-cache # Wipe turbo build cache
 *   npm run smart-reinstall -- --verbose     # Turbo verbose output
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Adds console.green, console.purple, etc.
require('./helpers');

// ─── Configuration ───────────────────────────────────────────────────────────

const ROOT_DIR = path.resolve(__dirname, '..');
const DEPS_HASH_MARKER = path.join(ROOT_DIR, 'node_modules', '.librechat-deps-hash');

const flags = {
  force: process.argv.includes('--force'),
  cleanCache: process.argv.includes('--clean-cache'),
  skipClient: process.argv.includes('--skip-client'),
  verbose: process.argv.includes('--verbose'),
};

// Workspace directories whose node_modules should be cleaned during reinstall
const NODE_MODULES_DIRS = [
  ROOT_DIR,
  path.join(ROOT_DIR, 'packages', 'data-provider'),
  path.join(ROOT_DIR, 'packages', 'data-schemas'),
  path.join(ROOT_DIR, 'packages', 'client'),
  path.join(ROOT_DIR, 'packages', 'api'),
  path.join(ROOT_DIR, 'client'),
  path.join(ROOT_DIR, 'api'),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
}

function exec(cmd, opts = {}) {
  execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit', ...opts });
}

// ─── Dependency Installation ─────────────────────────────────────────────────

function checkDeps() {
  const lockfile = path.join(ROOT_DIR, 'package-lock.json');
  if (!fs.existsSync(lockfile)) {
    return { needsInstall: true, hash: 'missing' };
  }

  const hash = hashFile(lockfile);

  if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
    return { needsInstall: true, hash };
  }
  if (!fs.existsSync(DEPS_HASH_MARKER)) {
    return { needsInstall: true, hash };
  }

  const stored = fs.readFileSync(DEPS_HASH_MARKER, 'utf-8').trim();
  return { needsInstall: stored !== hash, hash };
}

function installDeps(hash) {
  const { deleteNodeModules } = require('./helpers');
  NODE_MODULES_DIRS.forEach(deleteNodeModules);

  console.purple('Cleaning npm cache...');
  exec('npm cache clean --force');

  console.purple('Installing dependencies (npm ci)...');
  exec('npm ci');

  fs.writeFileSync(DEPS_HASH_MARKER, hash, 'utf-8');
}

// ─── Turbo Build ─────────────────────────────────────────────────────────────

function runTurboBuild() {
  const args = ['npx', 'turbo', 'run', 'build'];

  if (flags.skipClient) {
    args.push('--filter=!@librechat/frontend');
  }

  if (flags.force) {
    args.push('--force');
  }

  if (flags.verbose) {
    args.push('--verbosity=2');
  }

  const cmd = args.join(' ');
  console.gray(`      ${cmd}\n`);
  exec(cmd);
}

/**
 * Fallback for when turbo is not installed (e.g., first run before npm ci).
 * Runs the same sequential build as the original `npm run frontend`.
 */
function runFallbackBuild() {
  console.orange('      turbo not found — using sequential fallback build\n');

  const scripts = [
    'build:data-provider',
    'build:data-schemas',
    'build:api',
    'build:client-package',
  ];

  if (!flags.skipClient) {
    scripts.push('build:client');
  }

  for (const script of scripts) {
    console.purple(`  Running ${script}...`);
    exec(`npm run ${script}`);
  }
}

function hasTurbo() {
  const binDir = path.join(ROOT_DIR, 'node_modules', '.bin');
  return ['turbo', 'turbo.cmd', 'turbo.ps1'].some((name) => fs.existsSync(path.join(binDir, name)));
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const startTime = Date.now();

  console.green('\n Smart Reinstall — LibreChat');
  console.green('─'.repeat(45));

  // ── Handle --clean-cache ───────────────────────────────────────────────
  if (flags.cleanCache) {
    console.purple('Clearing Turborepo cache...');
    if (hasTurbo()) {
      try {
        exec('npx turbo daemon stop', { stdio: 'pipe' });
      } catch {
        // ignore — daemon may not be running
      }
    }
    // Clear local .turbo cache dir
    const localTurboCache = path.join(ROOT_DIR, '.turbo');
    if (fs.existsSync(localTurboCache)) {
      fs.rmSync(localTurboCache, { recursive: true });
    }
    // Clear global turbo cache
    if (hasTurbo()) {
      try {
        exec('npx turbo clean', { stdio: 'pipe' });
        console.green('Turbo cache cleared.');
      } catch {
        console.gray('Could not clear global turbo cache (may not exist yet).');
      }
    } else {
      console.gray('turbo not installed — nothing to clear.');
    }

    if (!flags.force) {
      return;
    }
  }

  // ── Step 1: Dependencies ───────────────────────────────────────────────
  console.purple('\n[1/2] Checking dependencies...');

  if (flags.force) {
    console.orange('      Force mode — reinstalling all dependencies');
    const lockfile = path.join(ROOT_DIR, 'package-lock.json');
    const hash = fs.existsSync(lockfile) ? hashFile(lockfile) : 'none';
    installDeps(hash);
    console.green('      Dependencies installed.');
  } else {
    const { needsInstall, hash } = checkDeps();
    if (needsInstall) {
      console.orange('      package-lock.json changed or node_modules missing');
      installDeps(hash);
      console.green('      Dependencies installed.');
    } else {
      console.green('      Dependencies up to date — skipping npm ci');
    }
  }

  // ── Step 2: Build packages ─────────────────────────────────────────────
  console.purple('\n[2/2] Building packages...');

  if (hasTurbo()) {
    runTurboBuild();
  } else {
    runFallbackBuild();
  }

  // ── Done ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.green('─'.repeat(45));
  console.green(`  Done (${elapsed}s)`);
  console.green('  Start the app with:  npm run backend');
  console.green('─'.repeat(45));
})().catch((err) => {
  console.red(`\nError: ${err.message}`);
  if (flags.verbose) {
    console.red(err.stack);
  }
  console.gray('  Tip: run with --force to clean all caches and reinstall from scratch');
  console.gray('  Tip: run with --verbose for detailed output');
  process.exit(1);
});
