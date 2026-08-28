#!/usr/bin/env node
/**
 * Local equivalent of the "Static checks" CI job
 * (.github/workflows/static-checks.yml), scoped to the files in a diff.
 *
 * The job has two layers and this mirrors both. Per-file checks (ESLint,
 * Prettier, import order) run against the changed JS/TS files under `api/`,
 * `client/` and `packages/`. Tree-wide gates (config migration tests, unused
 * i18n keys, unused npm packages) run only when the diff touches the paths
 * that gate them in CI. Circular-dependency detection and the TypeScript
 * project checks come from the Backend Unit Tests workflow rather than the
 * Static Checks job, but they gate on a commit's paths the same way.
 *
 * Like the CI job, every selected check runs even after one fails, and the
 * failures are summarized at the end.
 *
 * The per-file checks see the exact staged content of a commit, because the
 * pre-commit hook runs them through lint-staged. The tree-wide gates read the
 * working tree, the same as running them by hand — reading the index instead
 * would mean materializing a second checkout with its own installs and builds.
 *
 * Runs on Node 24+ via native type-stripping (`.mts` keeps ESM semantics under
 * the CommonJS repo root):
 *
 *   Staged diff (what the pre-commit hook runs):
 *     npm run static-checks
 *   Add the slow gates (TypeScript, config tests, i18n, depcheck):
 *     npm run static-checks:full
 *   Against a base ref, the way CI sees a pull request:
 *     node scripts/static-checks.mts --against origin/dev
 *   A single commit:
 *     node scripts/static-checks.mts --commit HEAD
 *   Explicit files:
 *     node scripts/static-checks.mts packages/api/src/index.ts
 *
 * Flags: --staged, --full, --fast, --only <ids>, --skip <ids>, --verbose,
 * --list. Check ids: eslint, prettier, imports, eslint-config, json,
 * circular-deps, typecheck, config-tests, i18n, depcheck.
 */

import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';

import type { Dirent } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Path filters, mirroring the `dorny/paths-filter` block in
 * .github/workflows/static-checks.yml. A group is active when some changed
 * file matches one of its patterns and no exclusion (`!`) pattern.
 * Keep the two in sync — the workflow additionally defines a `runner` group
 * for its own smoke test of this script, which has no local counterpart.
 */
const FILTERS = {
  eslint: [
    'api/**',
    'client/**',
    'packages/**',
    'eslint.config.mjs',
    '.github/workflows/static-checks.yml',
    '!**.md',
  ],
  eslint_config: ['eslint.config.mjs', '.github/workflows/static-checks.yml'],
  config: ['api/**', 'config/**', 'packages/**', '.github/workflows/static-checks.yml', '!**.md'],
  i18n: [
    'api/**',
    'client/src/**',
    'packages/client/**',
    'packages/data-provider/src/**',
    'packages/data-schemas/src/**',
    '.github/workflows/static-checks.yml',
    '!**.md',
  ],
  // Mirrors the Backend Unit Tests workflow, which owns both of these jobs.
  circular_deps: [
    'api/**',
    'packages/**',
    'package.json',
    'package-lock.json',
    'config/circular-deps.mjs',
    '.github/workflows/backend-review.yml',
    '!**.md',
  ],
  // The review workflows trigger their TypeScript jobs on the root manifests
  // too, since a dependency or @types bump can break compilation on its own.
  typecheck: [
    'client/**',
    'packages/**',
    'package.json',
    'package-lock.json',
    '.github/workflows/backend-review.yml',
    '.github/workflows/frontend-review.yml',
    '!**.md',
  ],
  unused_packages: [
    'api/**',
    'client/**',
    'packages/api/**',
    'packages/client/**',
    // Every workspace manifest PACKAGE_JSON_FILES validates, plus the ones
    // whose dependencies feed the unused-package calculation through
    // api/package.json's @librechat/data-schemas entry.
    'packages/data-provider/package.json',
    'packages/data-schemas/package.json',
    'package.json',
    'package-lock.json',
    '.github/workflows/static-checks.yml',
    '!**.md',
  ],
} as const;

type FilterName = keyof typeof FILTERS;

/** The same set the CI job lints, formats and import-sorts. */
const SOURCE_FILE_PATTERN = /^(api|client|packages)\/.*\.(js|jsx|ts|tsx)$/;

/** Files ESLint is pointed at when the flat config itself changes. */
const CONFIG_SMOKE_FILES = [
  'api/server/index.js',
  'client/src/main.jsx',
  'packages/api/src/index.ts',
];

const PACKAGE_JSON_FILES = [
  'package.json',
  'client/package.json',
  'api/package.json',
  'packages/api/package.json',
  'packages/client/package.json',
  'packages/data-provider/package.json',
  'packages/data-schemas/package.json',
];

const I18N_FILE = 'client/src/locales/en/translation.json';
const I18N_SOURCE_DIRS = [
  'client/src',
  'api',
  'packages/data-provider/src',
  'packages/client',
  'packages/data-schemas/src',
];

const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const IMPORT_EXTENSIONS = [...SOURCE_EXTENSIONS, '.mjs', '.cjs', '.mts', '.cts'];
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'coverage']);

/**
 * Batch limits, so a large diff cannot overflow the command line. Windows caps
 * a command line at 32767 characters — far below POSIX ARG_MAX — and a count
 * alone does not bound that: 400 of this repo's longer paths already approach
 * it, so the character budget is the real constraint and the count is a
 * secondary guard.
 */
const BATCH_SIZE = 400;
const BATCH_CHARS = 24000;

type Tier = 'fast' | 'slow';

interface CheckOutcome {
  ok: boolean;
  skipped?: string;
  output?: string;
  hints?: string[];
}

interface CheckContext {
  files: string[];
  sourceFiles: string[];
  groups: Record<FilterName, boolean>;
}

interface Check {
  id: string;
  title: string;
  tier: Tier;
  group: FilterName;
  run: (context: CheckContext) => CheckOutcome | Promise<CheckOutcome>;
}

/** A resolved tool invocation: `node <bin.js>` for a workspace package. */
interface Executable {
  command: string;
  args: string[];
  /** Windows resolves `.cmd` shims only through a shell. */
  shell?: boolean;
}

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
  output: string;
}

function fail(message: string): never {
  console.error(`static-checks: ${message}`);
  process.exit(2);
}

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const argv = process.argv.slice(2);

/** Every accepted flag, so a typo fails loudly instead of changing the run. */
const KNOWN_FLAGS = new Set([
  '--against',
  '--commit',
  '--only',
  '--skip',
  '--staged',
  '--full',
  '--fast',
  '--list',
  '--verbose',
]);

function readOption(name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail(`${name} requires a value`);
  return value;
}

const VALUED_OPTIONS = {
  against: readOption('--against'),
  commit: readOption('--commit'),
  only: readOption('--only'),
  skip: readOption('--skip'),
};

const OPTIONS = {
  against: VALUED_OPTIONS.against,
  commit: VALUED_OPTIONS.commit,
  only: parseList(VALUED_OPTIONS.only),
  skip: parseList(VALUED_OPTIONS.skip),
  list: argv.includes('--list'),
  verbose: argv.includes('--verbose'),
  full:
    argv.includes('--full') || (process.env.STATIC_CHECKS_FULL === '1' && !argv.includes('--fast')),
};

const OPTION_VALUES = new Set(
  Object.values(VALUED_OPTIONS).filter((value): value is string => value !== undefined),
);

const UNKNOWN_FLAGS = argv.filter((arg) => arg.startsWith('-') && !KNOWN_FLAGS.has(arg));
if (UNKNOWN_FLAGS.length > 0) {
  fail(`unknown option(s): ${UNKNOWN_FLAGS.join(', ')}`);
}

const FILE_ARGS = argv.filter((arg) => !arg.startsWith('-') && !OPTION_VALUES.has(arg));

/** Runs a command, capturing output so only failures have to be printed. */
function runCommand(executable: Executable, args: string[], cwd = ROOT): CommandResult {
  const result = spawnSync(executable.command, [...executable.args, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: executable.shell === true,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? (result.error ? `${result.error.message}\n` : '');
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
  };
}

/** Runs a command in batches so a large file list stays under the arg limit. */
function batchFiles(files: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let length = 0;
  for (const file of files) {
    const cost = file.length + 1;
    const full = batch.length >= BATCH_SIZE || length + cost > BATCH_CHARS;
    // A single path longer than the budget still gets its own batch rather
    // than an empty one.
    if (batch.length > 0 && full) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(file);
    length += cost;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function runOnFiles(executable: Executable, args: string[], files: string[]): CommandResult {
  let status = 0;
  let stdout = '';
  let stderr = '';
  for (const batch of batchFiles(files)) {
    const result = runCommand(executable, [...args, ...batch]);
    if (status === 0) status = result.status;
    stdout += result.stdout;
    stderr += result.stderr;
  }
  return { status, stdout, stderr, output: `${stdout}${stderr}` };
}

const GIT: Executable = { command: 'git', args: [] };

const NPM: Executable =
  process.platform === 'win32'
    ? { command: 'npm.cmd', args: [], shell: true }
    : { command: 'npm', args: [] };

function captureStdout(executable: Executable, args: string[]): string {
  const result = runCommand(executable, args);
  if (result.status !== 0) {
    fail(`${executable.command} ${args.join(' ')} failed:\n${result.stderr}`);
  }
  return result.stdout;
}

const require = createRequire(import.meta.url);

/**
 * Resolves an installed package's executable to `node <entry>`, which works
 * the same on every platform — unlike the `node_modules/.bin` shims, which
 * Node refuses to spawn on Windows without a shell.
 */
function resolveBin(name: string, binName = name): Executable | null {
  try {
    const manifestPath = require.resolve(`${name}/package.json`, { paths: [ROOT] });
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName];
    if (!entry) return null;
    return { command: process.execPath, args: [resolve(dirname(manifestPath), entry)] };
  } catch {
    return null;
  }
}

/**
 * A checker that cannot run is a failure, not a skip: reporting "all affected
 * static checks passed" without having linted anything is worse than saying
 * nothing. Only depcheck, which CI installs globally and this treats as
 * optional, is allowed to skip.
 */
function missingBin(name: string): CheckOutcome {
  return { ok: false, output: `${name} is not installed — run npm ci` };
}

function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index++;
        continue;
      }
      source += '[^/]*';
      continue;
    }
    source += /[a-zA-Z0-9/_-]/.test(char) ? char : `\\${char}`;
  }
  return new RegExp(`^${source}$`);
}

const MATCHERS = new Map<string, RegExp>();

function matches(pattern: string, file: string): boolean {
  let matcher = MATCHERS.get(pattern);
  if (!matcher) {
    matcher = globToRegExp(pattern);
    MATCHERS.set(pattern, matcher);
  }
  return matcher.test(file);
}

/** `some-with-excludes`: some file matches an include and no exclusion. */
function groupIsActive(files: string[], patterns: readonly string[]): boolean {
  const includes = patterns.filter((pattern) => !pattern.startsWith('!'));
  const excludes = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));
  return files.some(
    (file) =>
      includes.some((pattern) => matches(pattern, file)) &&
      !excludes.some((pattern) => matches(pattern, file)),
  );
}

interface Target {
  label: string;
  /** Every changed path, deletions included — this is what activates a group. */
  files: string[];
  /** Only paths the per-file checks can open, matching the CI job's file list. */
  existing: string[];
}

/**
 * Two lists, because CI derives two. `dorny/paths-filter` matches added,
 * modified AND deleted paths when it decides which checks are affected, while
 * the ESLint/Prettier/import-sort steps narrow to `--diff-filter=ACMRTUXB`
 * so they never hand a deleted path to a tool. Activating gates off the
 * narrowed list would let a delete-only commit — the last reference to a
 * translation key, say — slip past the i18n and depcheck gates.
 */
function diffPaths(args: string[]): { files: string[]; existing: string[] } {
  const split = (output: string): string[] => output.split('\0').filter(Boolean);
  return {
    files: split(captureStdout(GIT, args)),
    existing: split(captureStdout(GIT, [...args, '--diff-filter=ACMRTUXB'])),
  };
}

function resolveTarget(): Target {
  // Precedence would silently drop the losers: `--against origin/dev pkg.json`
  // checked only the file, and paired with --commit the base ref was never even
  // resolved, so a caller could believe a range had been checked.
  const selectors = [
    FILE_ARGS.length > 0 && 'file arguments',
    OPTIONS.commit && '--commit',
    OPTIONS.against && '--against',
    argv.includes('--staged') && '--staged',
  ].filter((selector): selector is string => typeof selector === 'string');
  if (selectors.length > 1) {
    fail(`${selectors.join(' and ')} cannot be combined — name the target once`);
  }

  if (FILE_ARGS.length > 0) {
    const files = FILE_ARGS.map((file) => relative(ROOT, resolve(file)).split('\\').join('/'));
    return { label: 'files from the command line', files, existing: files };
  }

  if (OPTIONS.commit) {
    // Paths come from the commit but contents come from the working tree, so
    // any other revision would be checked against the wrong file contents —
    // an added-then-deleted file would vanish, a since-modified one would be
    // read at its newer contents. Use --against for a range instead.
    const requested = captureStdout(GIT, [
      'rev-parse',
      '--verify',
      `${OPTIONS.commit}^{commit}`,
    ]).trim();
    const head = captureStdout(GIT, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    if (requested !== head) {
      fail(
        `--commit ${OPTIONS.commit} (${requested.slice(0, 10)}) is not the checked-out commit ` +
          `(${head.slice(0, 10)}). These checks read the working tree, so check that commit out ` +
          `first, or use --against <ref> to scope by a range.`,
      );
    }
    // Contents still come from the working tree, so uncommitted edits would
    // be scored against the named commit — an invalid uncommitted package.json
    // failing a valid HEAD, or an uncommitted fix masking a defect in it.
    const dirty = captureStdout(GIT, ['status', '--porcelain', '--untracked-files=no']).trim();
    if (dirty) {
      fail(
        'these checks read the working tree, so --commit needs it to match the commit; ' +
          `${dirty.split('\n').length} tracked file(s) differ. Commit or restore them, or drop ` +
          '--commit to check the staged diff.',
      );
    }
    // -m is load-bearing: without it a merge commit yields no paths at all.
    return {
      label: `commit ${OPTIONS.commit}`,
      ...diffPaths([
        'diff-tree',
        '--root',
        '-m',
        '--no-commit-id',
        '-r',
        '-z',
        '--name-only',
        OPTIONS.commit,
      ]),
    };
  }

  if (OPTIONS.against) {
    // Three dots: diff from the merge base, not between the two tips. Once the
    // base branch advances, a two-dot diff reports its commits in reverse as
    // part of this target, activating gates for files the branch never touched.
    return {
      label: `${OPTIONS.against}...HEAD`,
      ...diffPaths(['diff', '-z', '--name-only', `${OPTIONS.against}...HEAD`]),
    };
  }

  return {
    label: 'staged diff',
    ...diffPaths(['diff', '-z', '--cached', '--name-only']),
  };
}

/** Recursively yields repo-relative paths of source files under `dir`. */
async function* walkSourceFiles(dir: string, extensions: string[]): AsyncGenerator<string> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Dot directories hold tooling, not product code, and one of them —
      // .claude/worktrees — can hold a full checkout per branch.
      if (entry.name.startsWith('.') || SKIP_DIR_NAMES.has(entry.name)) continue;
      yield* walkSourceFiles(path, extensions);
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      yield path;
    }
  }
}

/** Every JS/TS-ish file under `dirs`, as absolute paths. */
async function collectFiles(dirs: string[], extensions: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const dir of dirs) {
    for await (const file of walkSourceFiles(resolve(ROOT, dir), extensions)) {
      files.push(file);
    }
  }
  return files;
}

// --------------------------------------------------------------- per-file checks

function lintChangedFiles(context: CheckContext): CheckOutcome {
  if (context.sourceFiles.length === 0) {
    return { ok: true, skipped: 'no changed JS/TS files' };
  }
  const eslint = resolveBin('eslint');
  if (!eslint) return missingBin('eslint');

  // --no-warn-ignored: changed files under config-ignored paths
  // (e.g. packages/data-schemas/misc/**) must not fail --max-warnings=0.
  const result = runOnFiles(
    eslint,
    [
      '--no-error-on-unmatched-pattern',
      '--config',
      'eslint.config.mjs',
      '--no-warn-ignored',
      '--max-warnings=0',
      '--',
    ],
    context.sourceFiles,
  );
  return {
    ok: result.status === 0,
    output: result.output,
    hints: ['Fix automatically where possible with: npx eslint --fix <files>'],
  };
}

function checkFormatting(context: CheckContext): CheckOutcome {
  if (context.sourceFiles.length === 0) {
    return { ok: true, skipped: 'no changed JS/TS files' };
  }
  const prettier = resolveBin('prettier');
  if (!prettier) return missingBin('prettier');

  const result = runOnFiles(
    prettier,
    ['--check', '--no-error-on-unmatched-pattern', '--'],
    context.sourceFiles,
  );
  return {
    ok: result.status === 0,
    output: result.output,
    hints: ['Fix with: npx prettier --write <files>'],
  };
}

function checkImportOrder(context: CheckContext): CheckOutcome {
  if (context.sourceFiles.length === 0) {
    return { ok: true, skipped: 'no changed JS/TS files' };
  }
  const sortImports: Executable = {
    command: process.execPath,
    args: [resolve(ROOT, 'scripts/sort-imports.mts'), '--check'],
  };
  const result = runOnFiles(sortImports, [], context.sourceFiles);
  return {
    ok: result.status === 0,
    output: result.output,
    hints: [
      'Fix everything with:      npm run sort-imports',
      'Fix specific files with:  npm run sort-imports -- <files>',
    ],
  };
}

/**
 * The changed-file lint never loads a changed root config: a config-only diff
 * matches no lintable files, so even a malformed eslint.config.mjs would pass.
 * When the config changes, gate on it loading and applying to representative
 * sources. CI additionally runs a full-tree regression sweep, which is too
 * slow to be worth repeating locally.
 */
function validateEslintConfig(): CheckOutcome {
  const eslint = resolveBin('eslint');
  if (!eslint) return missingBin('eslint');
  const result = runCommand(eslint, ['--config', 'eslint.config.mjs', ...CONFIG_SMOKE_FILES]);
  return { ok: result.status === 0, output: result.output };
}

async function validatePackageJson(): Promise<CheckOutcome> {
  const invalid: string[] = [];
  for (const file of PACKAGE_JSON_FILES) {
    const path = resolve(ROOT, file);
    if (!existsSync(path)) continue;
    try {
      JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      invalid.push(`${file}: ${(error as Error).message}`);
    }
  }
  return { ok: invalid.length === 0, output: invalid.join('\n') };
}

// --------------------------------------------------------------- config migration tests

/**
 * The config suite reaches these workspaces through their `dist` exports, so
 * CI builds them before running it. Building here too — rather than skipping
 * when `dist` is absent — keeps a fresh checkout from reporting a pass for a
 * gate that never ran, and keeps a stale `dist` from being tested instead of
 * the working tree. Each is a sub-second tsdown build.
 */
const CONFIG_TEST_BUILDS = ['build:data-provider', 'build:data-schemas', 'build:api'];

/** Dependency order; callers pass a subset and it is built in this sequence. */
const BUILD_ORDER = [
  'build:data-provider',
  'build:data-schemas',
  'build:api',
  'build:client-package',
];

/** Returns the failing build's outcome, or null when every build succeeded. */
function buildWorkspaces(scripts: string[]): CheckOutcome | null {
  for (const script of BUILD_ORDER.filter((entry) => scripts.includes(entry))) {
    const build = runCommand(NPM, ['run', script]);
    if (build.status !== 0) {
      return { ok: false, output: `npm run ${script} failed:\n${build.output}` };
    }
  }
  return null;
}

function runConfigTests(): CheckOutcome {
  const buildFailure = buildWorkspaces(CONFIG_TEST_BUILDS);
  if (buildFailure) return buildFailure;

  mkdirSync(resolve(ROOT, 'api/data'), { recursive: true });
  const authFile = resolve(ROOT, 'api/data/auth.json');
  if (!existsSync(authFile)) writeFileSync(authFile, '{}\n');

  const envFile = resolve(ROOT, 'api/test/.env.test');
  const envExample = resolve(ROOT, 'api/test/.env.test.example');
  if (!existsSync(envFile) && existsSync(envExample)) copyFileSync(envExample, envFile);

  const jest = resolveBin('jest');
  if (!jest) return missingBin('jest');

  // Same invocation as `npm run test:config`.
  const result = runCommand(jest, ['--config', 'config/jest.config.js']);
  return { ok: result.status === 0, output: result.output };
}

// --------------------------------------------------------------- unused i18n keys

const TOKEN_PATTERN = /[A-Za-z0-9_]+/g;
const CATEGORY_LOOKUP = /category\.(label|description).*startsWith.*['"]com_/;

/**
 * CI greps every key across the source dirs one key at a time. This collects
 * the identifiers once and tests keys against them, which is the same
 * substring question asked in a single pass: any occurrence of a key is inside
 * a maximal `[A-Za-z0-9_]+` run, because keys are made only of those
 * characters.
 */
async function findUnusedI18nKeys(): Promise<CheckOutcome> {
  const translationFile = resolve(ROOT, I18N_FILE);
  if (!existsSync(translationFile)) {
    return { ok: false, output: `Translation file not found: ${I18N_FILE}` };
  }

  const translations = JSON.parse(await readFile(translationFile, 'utf8')) as Record<
    string,
    string
  >;
  const keys = Object.keys(translations);
  if (keys.length === 0) return { ok: true, skipped: 'no keys defined' };

  const shortestKey = keys.reduce((shortest, key) => Math.min(shortest, key.length), Infinity);
  const tokens = new Set<string>();
  let hasCategoryLookup = false;

  for (const file of await collectFiles(I18N_SOURCE_DIRS, SOURCE_EXTENSIONS)) {
    const content = await readFile(file, 'utf8');
    if (!hasCategoryLookup) hasCategoryLookup = CATEGORY_LOOKUP.test(content);
    for (const token of content.match(TOKEN_PATTERN) ?? []) {
      if (token.length >= shortestKey) tokens.add(token);
    }
  }

  let tokenList: string[] | null = null;
  const isReferenced = (key: string): boolean => {
    if (tokens.has(key)) return true;
    tokenList ??= [...tokens];
    return tokenList.some((token) => token.includes(key));
  };

  const unused = keys.filter((key) => {
    // Special variable labels are built dynamically from TSpecialVarLabel.
    if (key.startsWith('com_ui_special_var_') && tokens.has('TSpecialVarLabel')) return false;
    // Agent category keys are read back from the database.
    if (
      key.startsWith('com_agents_category_') &&
      (hasCategoryLookup || tokens.has('ensureDefaultCategories'))
    ) {
      return false;
    }
    return !isReferenced(key);
  });

  if (unused.length === 0) return { ok: true };
  return {
    ok: false,
    output: `Found ${unused.length} unused i18n key(s):\n${unused.map((key) => `  ${key}`).join('\n')}`,
    hints: [`Remove them from ${I18N_FILE} or reference them in the source.`],
  };
}

// --------------------------------------------------------------- circular dependencies

function findCircularDependencies(): CheckOutcome {
  const script = resolve(ROOT, 'config/circular-deps.mjs');
  if (!existsSync(script)) {
    return { ok: false, output: 'config/circular-deps.mjs is missing' };
  }
  const result = runCommand({ command: process.execPath, args: [script] }, []);
  return { ok: result.status === 0, output: result.output };
}

// --------------------------------------------------------------- TypeScript

/**
 * One entry per `tsc --noEmit` the review workflows run. `paths` includes each
 * project's upstream packages, so an edit to data-provider still typechecks the
 * projects that consume it; `requires` lists the builds its imports resolve
 * through, mirroring those jobs' dependency on the build artifacts.
 */
const ROOT_MANIFESTS = ['package.json', 'package-lock.json'];

/** Each imported gate reruns in CI when its owning workflow changes. */
const BACKEND_REVIEW = '.github/workflows/backend-review.yml';
const FRONTEND_REVIEW = '.github/workflows/frontend-review.yml';

const TYPECHECK_PROJECTS = [
  {
    project: 'packages/data-provider/tsconfig.json',
    paths: ['packages/data-provider/**', ...ROOT_MANIFESTS, BACKEND_REVIEW, '!**.md'],
    requires: [],
  },
  {
    project: 'packages/data-schemas/tsconfig.json',
    paths: [
      'packages/data-provider/**',
      'packages/data-schemas/**',
      ...ROOT_MANIFESTS,
      BACKEND_REVIEW,
      '!**.md',
    ],
    requires: ['build:data-provider'],
  },
  {
    project: 'packages/api/tsconfig.json',
    paths: [
      'packages/data-provider/**',
      'packages/data-schemas/**',
      'packages/api/**',
      ...ROOT_MANIFESTS,
      BACKEND_REVIEW,
      '!**.md',
    ],
    requires: ['build:data-provider', 'build:data-schemas'],
  },
  {
    project: 'packages/client/tsconfig.json',
    paths: [
      'packages/data-provider/**',
      'packages/client/**',
      ...ROOT_MANIFESTS,
      BACKEND_REVIEW,
      '!**.md',
    ],
    requires: ['build:data-provider'],
  },
  {
    project: 'client/tsconfig.json',
    paths: [
      'client/**',
      'packages/data-provider/**',
      'packages/client/**',
      ...ROOT_MANIFESTS,
      FRONTEND_REVIEW,
      '!**.md',
    ],
    requires: ['build:data-provider', 'build:client-package'],
  },
];

function runTypecheck(context: CheckContext): CheckOutcome {
  const selected = TYPECHECK_PROJECTS.filter((entry) => groupIsActive(context.files, entry.paths));
  if (selected.length === 0) {
    return { ok: true, skipped: 'no changed TypeScript project' };
  }

  const tsc = resolveBin('typescript', 'tsc');
  if (!tsc) return missingBin('typescript');

  const buildFailure = buildWorkspaces([...new Set(selected.flatMap((entry) => entry.requires))]);
  if (buildFailure) return buildFailure;

  const failures: string[] = [];
  for (const entry of selected) {
    const result = runCommand(tsc, ['--noEmit', '-p', entry.project]);
    if (result.status !== 0) {
      failures.push(`${entry.project}:\n${result.output.trim()}`);
    }
  }

  return {
    ok: failures.length === 0,
    output: failures.join('\n\n'),
    hints: [
      'Missing properties on a workspace type usually mean a stale build: run npm run build:packages.',
      'In a git worktree, librechat-data-provider resolves to the main checkout, whose dist may predate your branch.',
    ],
  };
}

// --------------------------------------------------------------- unused npm packages

const IMPORT_PATTERNS = [
  /require\(\s*['"]([a-zA-Z0-9@/._-]+)['"]\s*\)/g,
  /\bimport\b[^\n]*?\bfrom\s*['"]([a-zA-Z0-9@/._-]+)['"]/g,
  /\bexport\b[^\n]*?\bfrom\s*['"]([a-zA-Z0-9@/._-]+)['"]/g,
  /\bimport\s*['"]([a-zA-Z0-9@/._-]+)['"]/g,
];

/** `@scope/pkg/sub` -> `@scope/pkg`, `pkg/sub` -> `pkg`, relative -> null. */
function packageName(specifier: string): string | null {
  if (specifier.startsWith('.')) return null;
  if (!specifier.startsWith('@')) return specifier.split('/')[0];
  const [scope, name] = specifier.split('/');
  return name ? `${scope}/${name}` : null;
}

async function importedPackages(dir: string): Promise<Set<string>> {
  const packages = new Set<string>();
  for (const file of await collectFiles([dir], IMPORT_EXTENSIONS)) {
    const content = await readFile(file, 'utf8');
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        const name = packageName(match[1]);
        if (name) packages.add(name);
      }
    }
  }
  return packages;
}

interface Manifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

async function readManifest(file: string): Promise<Manifest | null> {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as Manifest;
}

/** Words appearing in a manifest's npm scripts, as CI extracts them. */
function scriptWords(manifest: Manifest | null): Set<string> {
  const words = new Set<string>();
  for (const script of Object.values(manifest?.scripts ?? {})) {
    for (const word of script.match(/[a-zA-Z0-9_-]+/g) ?? []) words.add(word);
  }
  return words;
}

function manifestDependencies(manifest: Manifest | null): Set<string> {
  return new Set([
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
    ...Object.keys(manifest?.peerDependencies ?? {}),
  ]);
}

/** Dependencies a manifest inherits through its `@librechat/*` workspaces. */
async function workspaceDependencies(manifest: Manifest | null): Promise<Set<string>> {
  const inherited = new Set<string>();
  for (const dependency of Object.keys(manifest?.dependencies ?? {})) {
    if (!dependency.startsWith('@librechat/')) continue;
    const workspace = await readManifest(
      `${dependency.replace('@librechat/', 'packages/')}/package.json`,
    );
    for (const name of Object.keys(workspace?.dependencies ?? {})) inherited.add(name);
    for (const name of Object.keys(workspace?.peerDependencies ?? {})) inherited.add(name);
  }
  return inherited;
}

/** Falls back to a global install, which is how CI provides depcheck. */
function resolveDepcheck(): Executable {
  return (
    resolveBin('depcheck') ?? {
      command: 'depcheck',
      args: [],
      // A global install is `depcheck.cmd` on Windows, which needs a shell.
      shell: process.platform === 'win32',
    }
  );
}

function unusedDependencies(depcheck: Executable, cwd: string): string[] | null {
  const result = runCommand(depcheck, ['--json'], cwd);
  // depcheck exits non-zero when it reports findings, so only parse failures matter.
  try {
    const report = JSON.parse(result.stdout) as { dependencies?: string[] };
    return report.dependencies ?? [];
  } catch {
    return null;
  }
}

async function findUnusedPackages(): Promise<CheckOutcome> {
  const depcheck = resolveDepcheck();
  const probe = runCommand(depcheck, ['--version']);
  if (probe.status !== 0) {
    return { ok: true, skipped: 'depcheck is not installed — npm install -g depcheck' };
  }

  const [rootManifest, clientManifest, apiManifest, packagesClientManifest, packagesApiManifest] =
    await Promise.all([
      readManifest('package.json'),
      readManifest('client/package.json'),
      readManifest('api/package.json'),
      readManifest('packages/client/package.json'),
      readManifest('packages/api/package.json'),
    ]);

  const [rootCode, clientCode, apiCode, packagesClientCode, packagesApiCode] = await Promise.all([
    importedPackages('.'),
    importedPackages('client'),
    importedPackages('api'),
    importedPackages('packages/client'),
    importedPackages('packages/api'),
  ]);

  const targets = [
    {
      name: 'Root',
      dir: ROOT,
      allowed: [scriptWords(rootManifest), rootCode, await workspaceDependencies(rootManifest)],
      ignored: new Set<string>(),
    },
    {
      name: 'Client',
      dir: resolve(ROOT, 'client'),
      allowed: [
        scriptWords(clientManifest),
        clientCode,
        await workspaceDependencies(clientManifest),
        packagesClientCode,
        manifestDependencies(packagesClientManifest),
      ],
      // Consumed through a bundler alias, so depcheck cannot see the import.
      ignored: new Set(['micromark-extension-llm-math']),
    },
    {
      name: 'API',
      dir: resolve(ROOT, 'api'),
      allowed: [
        scriptWords(apiManifest),
        apiCode,
        await workspaceDependencies(apiManifest),
        packagesApiCode,
        manifestDependencies(packagesApiManifest),
      ],
      ignored: new Set<string>(),
    },
  ];

  const findings: string[] = [];
  for (const target of targets) {
    if (!existsSync(join(target.dir, 'package.json'))) continue;
    const unused = unusedDependencies(depcheck, target.dir);
    if (unused === null) {
      return { ok: false, output: `depcheck produced no JSON report for ${target.name}` };
    }
    const reportable = unused.filter(
      (name) => !target.ignored.has(name) && !target.allowed.some((set) => set.has(name)),
    );
    if (reportable.length > 0) {
      findings.push(
        `${target.name} unused dependencies:\n${reportable.map((n) => `  ${n}`).join('\n')}`,
      );
    }
  }

  return {
    ok: findings.length === 0,
    output: findings.join('\n'),
    // CI scans node_modules too, so it treats a few more packages as used.
    hints: [
      'CI also counts imports found under node_modules — confirm before removing a dependency.',
    ],
  };
}

// --------------------------------------------------------------- runner

const CHECKS: Check[] = [
  { id: 'eslint', title: 'ESLint', tier: 'fast', group: 'eslint', run: lintChangedFiles },
  { id: 'prettier', title: 'Prettier', tier: 'fast', group: 'eslint', run: checkFormatting },
  { id: 'imports', title: 'Import sorting', tier: 'fast', group: 'eslint', run: checkImportOrder },
  {
    id: 'eslint-config',
    title: 'ESLint config validation',
    tier: 'fast',
    group: 'eslint_config',
    run: validateEslintConfig,
  },
  {
    id: 'json',
    title: 'package.json validation',
    tier: 'fast',
    group: 'unused_packages',
    run: validatePackageJson,
  },
  {
    id: 'circular-deps',
    title: 'Circular dependencies',
    tier: 'fast',
    group: 'circular_deps',
    run: findCircularDependencies,
  },
  {
    id: 'typecheck',
    title: 'TypeScript',
    tier: 'slow',
    group: 'typecheck',
    run: runTypecheck,
  },
  {
    id: 'config-tests',
    title: 'Config migration tests',
    tier: 'slow',
    group: 'config',
    run: runConfigTests,
  },
  { id: 'i18n', title: 'Unused i18n keys', tier: 'slow', group: 'i18n', run: findUnusedI18nKeys },
  {
    id: 'depcheck',
    title: 'Unused npm packages',
    tier: 'slow',
    group: 'unused_packages',
    run: findUnusedPackages,
  },
];

const TITLE_WIDTH = 26;

function report(symbol: string, title: string, detail: string): void {
  console.log(`  ${symbol} ${title.padEnd(TITLE_WIDTH)} ${detail}`);
}

function printBlock(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  console.log(
    trimmed
      .split('\n')
      .map((line) => `      ${line}`)
      .join('\n'),
  );
}

async function main(): Promise<void> {
  const unknown = [...OPTIONS.only, ...OPTIONS.skip].filter(
    (id) => !CHECKS.some((check) => check.id === id),
  );
  if (unknown.length > 0) fail(`unknown check id(s): ${unknown.join(', ')}`);

  const target = resolveTarget();
  const groups = Object.fromEntries(
    Object.entries(FILTERS).map(([name, patterns]) => [
      name,
      groupIsActive(target.files, patterns),
    ]),
  ) as Record<FilterName, boolean>;

  const context: CheckContext = {
    files: target.files,
    groups,
    sourceFiles: target.existing
      .filter((file) => SOURCE_FILE_PATTERN.test(file))
      .filter((file) => existsSync(resolve(ROOT, file))),
  };

  const selected = CHECKS.filter(
    (check) => OPTIONS.only.length === 0 || OPTIONS.only.includes(check.id),
  );

  if (OPTIONS.list) {
    console.log(`Static checks · ${target.label} · ${target.files.length} file(s)`);
    for (const check of CHECKS) {
      const state = !selected.includes(check)
        ? 'deselected'
        : OPTIONS.skip.includes(check.id)
          ? 'skipped (--skip)'
          : !groups[check.group]
            ? 'not affected'
            : check.tier === 'slow' && !OPTIONS.full && !OPTIONS.only.includes(check.id)
              ? 'slow tier (--full)'
              : 'would run';
      report(' ', `${check.title} (${check.id})`, state);
    }
    return;
  }

  console.log(`Static checks · ${target.label} · ${target.files.length} file(s)`);
  if (target.files.length === 0) {
    console.log('\nNothing to check.');
    return;
  }

  const failures: string[] = [];
  let skipped = 0;

  for (const check of selected) {
    if (OPTIONS.skip.includes(check.id)) {
      skipped++;
      report('–', check.title, 'skipped (--skip)');
      continue;
    }
    if (!groups[check.group]) {
      report('–', check.title, 'not affected by this diff');
      continue;
    }
    if (check.tier === 'slow' && !OPTIONS.full && !OPTIONS.only.includes(check.id)) {
      skipped++;
      report('–', check.title, 'skipped (run with --full)');
      continue;
    }

    const started = Date.now();
    // The CI job gives every step continue-on-error; a check that throws
    // (malformed translation JSON, say) must not cancel the ones after it.
    let outcome: CheckOutcome;
    try {
      outcome = await check.run(context);
    } catch (error) {
      outcome = { ok: false, output: `${check.title} threw: ${(error as Error).stack ?? error}` };
    }
    const elapsed = `${((Date.now() - started) / 1000).toFixed(1)}s`;

    if (outcome.skipped) {
      skipped++;
      report('–', check.title, `skipped: ${outcome.skipped}`);
      continue;
    }
    if (outcome.ok) {
      report('✓', check.title, elapsed);
      if (OPTIONS.verbose) printBlock(outcome.output ?? '');
      continue;
    }

    failures.push(check.title);
    report('✗', check.title, elapsed);
    printBlock(outcome.output ?? '');
    for (const hint of outcome.hints ?? []) printBlock(hint);
  }

  const tail = skipped > 0 ? ` (${skipped} skipped)` : '';
  if (failures.length === 0) {
    console.log(`\nAll affected static checks passed${tail}.`);
    return;
  }

  console.log(`\nStatic checks failed:\n${failures.map((title) => `  - ${title}`).join('\n')}`);
  process.exitCode = 1;
}

await main();
