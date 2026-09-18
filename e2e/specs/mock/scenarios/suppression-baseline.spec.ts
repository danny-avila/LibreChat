import { createRequire } from 'node:module';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { inOneProject, repoRoot, run, staticChecks } from './lint.helpers';

/**
 * `eslint-suppressions.json` records what the tree already owed when the design
 * rules landed, as a count per file and rule. What a contributor meets is one
 * scenario each: the commit that FIXES one of those violations must not be
 * rejected for leaving the count too high; a file move must not leave the old
 * path silencing a future file that reuses it; a count edit must be read even
 * when it rides along with a source change; a change to what the rules read must
 * revalidate counts in files it never touches; an inline comment must not be a
 * way to silence a design rule; and a record that no longer says what it claims
 * must be rejected. None of them needs the browser — each runs the configured
 * command and reads what it does.
 */

type Suppressions = Record<string, Record<string, { count: number }>>;
const SUPPRESSIONS_FILE = 'eslint-suppressions.json';
const suppressionsPath = resolve(repoRoot, SUPPRESSIONS_FILE);
const ESLINT = resolve(repoRoot, 'node_modules/.bin/eslint');

const readBaseline = (): Suppressions =>
  JSON.parse(readFileSync(suppressionsPath, 'utf8')) as Suppressions;

/** A scratch baseline in its own directory; ESLint and the runner both take a
 *  baseline's location as an argument, so nothing here writes into the tree. */
function writeBaseline(content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'lc-suppressions-')), SUPPRESSIONS_FILE);
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`);
  return path;
}

/** lint-staged's config is CommonJS, so it is loaded the way lint-staged loads
 *  it. Executing it is the point: the assertion is about the real commands. A
 *  task may be a function — that is how a command opts out of having the staged
 *  filenames appended — so each one is resolved the way lint-staged resolves
 *  it, with the staged list. */
type HookTask = string | ((files: string[]) => string | string[]);

const loadHookConfig = (path: string, staged: string[]): Record<string, string[]> => {
  const config = createRequire(__filename)(path) as Record<string, HookTask[]>;
  return Object.fromEntries(
    Object.entries(config).map(([pattern, tasks]) => [
      pattern,
      tasks.flatMap((task) => (typeof task === 'function' ? task(staged) : task)),
    ]),
  );
};

test.describe('the recorded design-rule backlog', () => {
  test('fixing a recorded violation keeps the configured lint runs green @scenario:fixing-a-recorded-violation-keeps-the-configured-lint-runs-green', () => {
    inOneProject();
    test.setTimeout(180_000);

    /** Pick a real recorded file and claim one more violation than it has, which
     *  is the state a fix leaves behind until the counts are pruned. */
    const baseline = readBaseline();
    const [file, rules] = Object.entries(baseline)[0];
    const [rule, { count }] = Object.entries(rules)[0];
    const overCounted = writeBaseline({ [file]: { [rule]: { count: count + 1 } } });
    const baselineText = readFileSync(suppressionsPath, 'utf8');

    /** The real pre-commit commands, read by executing the hook's own config:
     *  a copy of the command list here would pass while the hook was broken.
     *  Only the direct ESLint invocations take a suppressions location; the
     *  hook's last task is the runner, asserted below. */
    const hook = loadHookConfig(resolve(repoRoot, '.husky/lint-staged.config.js'), [file]);
    const tasks = hook['*.{js,jsx,ts,tsx}'];

    /** The metadata build has to come before the fixing pass: run after it, a
     *  stale `packages/client/dist` is what the design rules classify against,
     *  and lint-staged stops at the first failure. */
    const buildAt = tasks.findIndex((command) => command.includes('build:client-package'));
    const fixAt = tasks.findIndex((command) => command.startsWith('eslint'));
    expect(buildAt, 'the hook no longer builds the design metadata').toBeGreaterThanOrEqual(0);
    expect(buildAt).toBeLessThan(fixAt);
    const commands = tasks.filter((command) => command.startsWith('eslint'));
    expect(commands.length).toBeGreaterThan(0);

    for (const command of commands) {
      const [, ...args] = command.split(' ');
      const green = run(ESLINT, [...args, '--suppressions-location', overCounted, '--', file]);
      expect(green.status, `${command} rejected the diff that fixed a recorded violation`).toBe(0);

      /** The counter-proof: the same command without the flag exits 2, so the
       *  flag is what keeps the fixing commit committable. */
      const withoutFlag = args.filter((arg) => arg !== '--pass-on-unpruned-suppressions');
      const red = run(ESLINT, [...withoutFlag, '--suppressions-location', overCounted, '--', file]);
      expect(red.status).toBe(2);
      expect(red.output).toContain('suppressions left that do not occur anymore');
    }

    /** And the hook's authoritative pass is the runner itself, so the commit and
     *  the lane read the same rules from the same metadata. */
    expect(
      tasks.some((command) => command.includes('static-checks.mts') && command.includes('--only')),
      'the hook no longer runs the CI mirror',
    ).toBe(true);

    /** The other half of the policy: the commit stays possible, and the lane
     *  then asks for the prune. Capacity a fix freed is capacity the next change
     *  could spend, so the suppressions check rejects a count higher than the
     *  file's violations and names the command that tightens it. */
    const slack = writeBaseline({ [file]: { [rule]: { count: count + 3 } } });
    const capacity = staticChecks([slack, '--only', 'suppressions']);
    expect(capacity.status, 'unused suppression capacity passed the lane').not.toBe(0);
    expect(capacity.output).toContain('would silence a later violation');
    expect(capacity.output).toContain('npm run lint:design:prune');

    /** The re-record has to survive the backlog it is recording. `--suppress-rule`
     *  names the design rules, but the run still reports every other rule in the
     *  roots, and those roots carry a pre-existing error backlog, so the
     *  re-record exits non-zero on a perfectly good write. What matters is that
     *  the write happened, which is why the documented chain does not gate the
     *  prune on that status. */
    const recorded = writeBaseline({});
    const debt = Object.keys(baseline).find((path) => path.endsWith('.tsx')) ?? file;
    const write = run(ESLINT, [
      '--no-warn-ignored',
      '--suppress-rule',
      rule,
      '--suppressions-location',
      recorded,
      '--',
      debt,
    ]);
    expect(existsSync(recorded), 'the re-record wrote no baseline').toBe(true);
    const written = JSON.parse(readFileSync(recorded, 'utf8')) as Suppressions;
    expect(Object.keys(written)).toContain(debt);
    /** Not asserted as an expected failure — a clean root would exit 0 — but the
     *  baseline above is written either way, and that is what the prune needs. */
    expect([0, 1]).toContain(write.status);

    /** And the repository's own baseline is exactly as it was: this scenario
     *  writes only into `os.tmpdir()`. */
    expect(readFileSync(suppressionsPath, 'utf8')).toBe(baselineText);
  });

  test('re-recording a moved file drops its old path @scenario:re-recording-a-moved-file-drops-its-old-path', () => {
    inOneProject();
    test.setTimeout(180_000);

    /** Suppressions are keyed by path, so a move records the new path and leaves
     *  the old one behind; only the prune removes it. Chaining the two is what
     *  makes the documented move recipe complete, and the two halves are run
     *  below rather than read out of `package.json`: the re-record's write is
     *  asserted in the scenario above, and the prune's removal here. */

    const baseline = readBaseline();
    const recorded = Object.keys(baseline);
    const linted = recorded.find((path) => path.startsWith('client/src/a11y/')) ?? recorded[0];
    const directory = linted.slice(0, linted.lastIndexOf('/'));
    const outside = recorded.find((path) => !path.startsWith(`${directory}/`));
    if (!outside) {
      throw new Error('the baseline records only one directory; pick another fixture');
    }
    const phantom = `${directory}/ThisFileMovedAway.tsx`;
    expect(existsSync(resolve(repoRoot, phantom))).toBe(false);

    const scratch = writeBaseline({
      [linted]: baseline[linted],
      [phantom]: { 'shadcn/no-restyle': { count: 4 } },
      [outside]: baseline[outside],
    });

    const pruned = run(ESLINT, [
      '--no-warn-ignored',
      '--prune-suppressions',
      '--suppressions-location',
      scratch,
      directory,
    ]);
    expect(pruned.status, pruned.output).toBe(0);

    const after = JSON.parse(readFileSync(scratch, 'utf8')) as Suppressions;
    expect(after[phantom]).toBeUndefined();
    /** A file the prune never linted keeps its entry: the sweep removes paths,
     *  it does not silently rewrite counts for the rest of the tree. */
    expect(after[outside]).toEqual(baseline[outside]);
    expect(after[linted]).toEqual(baseline[linted]);
  });

  test('a count edit riding along with a recorded source is still read @scenario:a-count-edit-riding-along-with-a-recorded-source-is-rejected', () => {
    inOneProject();
    test.setTimeout(180_000);

    /** A count edit is measured against `HEAD` when no range is given, which is
     *  the pre-commit case. Without that fallback a diff that also touches one
     *  recorded source would narrow the check to that source and let every other
     *  count edit through to CI, so the shape under test is the baseline passed
     *  alongside a recorded source. */
    const baseline = readBaseline();
    const caller = Object.keys(baseline).find((path) => path.startsWith('client/src/'));
    if (!caller) {
      throw new Error('the baseline records no client/src caller; pick another fixture');
    }
    const callerRule = Object.keys(baseline[caller])[0];
    const slack = writeBaseline({
      [caller]: { [callerRule]: { count: baseline[caller][callerRule].count + 4 } },
    });
    const recordedSource = Object.keys(baseline).find(
      (path) => path !== caller && path.startsWith('client/src/'),
    );
    if (!recordedSource) {
      throw new Error('the baseline records only one client/src file; pick another fixture');
    }

    const alongside = staticChecks([slack, recordedSource, '--only', 'suppressions']);
    expect(alongside.status, 'a count edit rode along with a recorded source').not.toBe(0);
    expect(alongside.output).toContain(caller);
    expect(alongside.output).toContain('would silence a later violation');

    /** And the commit reaches it too: a diff that lowers a count or narrows a
     *  rule touches no source file, so the hook's source group never runs — the
     *  baseline and the config have a group of their own that runs this check. */
    const hook = loadHookConfig(resolve(repoRoot, '.husky/lint-staged.config.js'), [
      SUPPRESSIONS_FILE,
    ]);
    const baselineGroup = Object.entries(hook).find(([pattern]) =>
      pattern.includes(SUPPRESSIONS_FILE),
    );
    expect(baselineGroup, 'no hook group matches the baseline').toBeDefined();
    expect(baselineGroup?.[1].join(' ')).toContain('--only suppressions');
  });

  test('changing what the design rules read revalidates every recorded count @scenario:changing-what-the-design-rules-read-revalidates-every-recorded-count', () => {
    inOneProject();
    test.setTimeout(240_000);

    /**
     * A count stands for what the rules report, and several things move that
     * without touching the file the count belongs to: the flat config, the
     * manifests the plugin is installed from, the library's own manifest and
     * build config, a primitive's `cva` variants, an app-local component source,
     * and this runner, which decides what a count has to match. Each has to
     * revalidate the record for files the diff never names.
     *
     * Run against a miniature tree rather than the checkout: the real roots are
     * ~2,500 files and each sweep costs minutes, while what is under test is
     * which files the gate asks about — the real runner, the real flat config and
     * the real plugin, over two sources. The checkout's own 437 recorded paths
     * are swept at full scale by the committed-baseline scenario below.
     */
    const root = syntheticRoot();
    /** The copied runner, invoked from the miniature tree: it derives the
     *  repository from its own location and relativizes its file arguments
     *  against the working directory, so asking it about `eslint.config.mjs`
     *  from anywhere else names a path outside its tree and selects nothing. */
    const checks = (files: string[]) =>
      run(
        process.execPath,
        [join(root, 'scripts/static-checks.mts'), ...files, '--only', 'suppressions'],
        { cwd: root },
      );
    try {
      const triggers = [
        'eslint.config.mjs',
        'package.json',
        'package-lock.json',
        'packages/client/package.json',
        'packages/client/tsdown.config.mjs',
        'scripts/static-checks.mts',
        'packages/client/src/Primitive.tsx',
        'client/src/components/ui/Thing.tsx',
      ];
      for (const trigger of triggers) {
        const report = checks([trigger]);
        expect(report.status, `${trigger} revalidated nothing`).not.toBe(0);
        /** A violation in a file the diff never named and the record never
         *  mentioned: only a sweep of the roots can see it. */
        expect(report.output, `${trigger} missed an unrecorded caller`).toContain(
          'client/src/Caller.tsx',
        );
        /** And slack recorded against a file the diff never touched. */
        expect(report.output, `${trigger} missed an untouched over-count`).toContain(
          'client/src/Clean.tsx',
        );
      }

      /** The reach is conditional, which is what makes the runs above evidence:
       *  an ordinary source change checks that file and stops there. */
      const unrecorded = checks(['client/src/Other.tsx']);
      expect(unrecorded.status, unrecorded.output).toBe(0);
      const ordinary = checks(['client/src/Clean.tsx']);
      expect(ordinary.status, 'a recorded source with slack passed').not.toBe(0);
      expect(ordinary.output).toContain('client/src/Clean.tsx');
      expect(ordinary.output, 'an ordinary source change swept the roots').not.toContain(
        'client/src/Caller.tsx',
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test('silencing a design rule with an inline comment is rejected @scenario:silencing-a-design-rule-with-an-inline-comment-is-rejected', () => {
    inOneProject();
    test.setTimeout(180_000);

    /** An inline comment is the one way to silence a design rule that leaves
     *  nothing behind to review, and a file with no entry could otherwise carry
     *  one past every other check. The check lints the diff's design sources
     *  twice — with and without `--no-inline-config` — so every spelling is
     *  caught, including a description after `--`, and text that only looks like
     *  a directive is not. A directive over a file that does not violate the
     *  rule silences nothing yet, so the two runs agree; that one is caught by
     *  asking the same run for unused directives. */
    const probe = 'client/src/__directive_probe__.tsx';
    const probePath = join(repoRoot, probe);
    const silenced = [
      ['a named disable', '/* eslint-disable shadcn/no-raw-colors */'],
      ['a justified disable', '/* eslint-disable shadcn/no-raw-colors -- because */'],
      ['a blanket disable', '/* eslint-disable */'],
      ['a described blanket disable', '/* eslint-disable -- temporary */'],
      ['a described next-line disable', '// eslint-disable-next-line -- temporary'],
      ['rule configuration', '/* eslint shadcn/no-raw-colors: off */'],
    ];
    try {
      for (const [label, comment] of silenced) {
        writeFileSync(
          probePath,
          `${comment}\nexport default () => <div className="bg-pink-500" />;\n`,
        );
        const report = staticChecks([probe, '--only', 'suppressions']);
        expect(report.status, `${label} passed`).not.toBe(0);
        expect(report.output, label).toContain(
          'shadcn/no-raw-colors is silenced by an inline comment',
        );
      }

      /** The dormant case: a directive in a clean file, which would otherwise
       *  land unseen and then silence the first violation anyone adds. */
      const dormant = [
        ['a dormant named disable', '/* eslint-disable shadcn/no-raw-colors */'],
        ['a dormant justified disable', '/* eslint-disable shadcn/no-raw-colors -- later */'],
        ['a dormant next-line disable', '// eslint-disable-next-line shadcn/no-raw-colors'],
      ];
      for (const [label, comment] of dormant) {
        writeFileSync(
          probePath,
          `${comment}\nexport default () => <div className="bg-surface-primary" />;\n`,
        );
        const report = staticChecks([probe, '--only', 'suppressions']);
        expect(report.status, `${label} passed`).not.toBe(0);
        expect(report.output, label).toContain('would silence the first violation anyone adds');
      }

      /** A blanket one covers the design rules whatever else it covers, so a
       *  dormant blanket disable inside a design root is rejected too. */
      writeFileSync(
        probePath,
        '/* eslint-disable */\nexport default () => <div className="bg-surface-primary" />;\n',
      );
      const blanket = staticChecks([probe, '--only', 'suppressions']);
      expect(blanket.status, 'a dormant blanket disable passed').not.toBe(0);
      expect(blanket.output).toContain('a blanket eslint-disable silences nothing here');

      /** And two things that are not a silenced rule: a directive naming another
       *  rule — the tree carries forty of them — and a string that reads like
       *  one. */
      for (const [label, source] of [
        [
          'a directive for another rule',
          '// eslint-disable-next-line react-hooks/exhaustive-deps\nexport default () => <div className="bg-surface-primary" />;\n',
        ],
        [
          'comment-like text in a string',
          'export default () => <div className="bg-surface-primary" title="/* eslint-disable shadcn/no-raw-colors */" />;\n',
        ],
      ]) {
        writeFileSync(probePath, source);
        const report = staticChecks([probe, '--only', 'suppressions']);
        expect(report.status, `${label}: ${report.output}`).toBe(0);
      }
    } finally {
      rmSync(probePath, { force: true });
    }
  });

  test('a backlog that no longer says what it claims is rejected @scenario:a-backlog-that-no-longer-says-what-it-claims-is-rejected', () => {
    inOneProject();
    test.setTimeout(240_000);

    /** The record is data the lint reads, so a diff that edits it alone reaches
     *  no lintable file and nothing else would read it. Start from the positive
     *  control: the committed backlog passes its own gate — every recorded path
     *  exists, is reported on by a design-rule lint, and records the count that
     *  file actually has. */
    const baselineText = readFileSync(suppressionsPath, 'utf8');
    const passing = staticChecks([SUPPRESSIONS_FILE, '--only', 'suppressions']);
    expect(passing.status, passing.output).toBe(0);

    /** And each way it can stop saying what it claims fails, naming the key. The
     *  check validates every suppressions file the target names, so the invalid
     *  ones live in their own scratch directories and the repository's baseline
     *  is never written to. A count against a path no design-rule lint reports on
     *  is the quiet one: `client/src/style.css` is committed, inside a design
     *  root, and outside every AST rule, so the entry silences nothing and waits
     *  for whatever is linted at that path later. */
    const invalid: [string, unknown, string][] = [
      ['a shape ESLint cannot load', [], 'expected an object keyed by file path'],
      [
        'a count no run can reach',
        { 'client/src/App.jsx': { 'shadcn/no-restyle': { count: 0 } } },
        'positive integer count',
      ],
      [
        'a rule the plugin does not define',
        { 'client/src/App.jsx': { 'shadcn/no-shadows': { count: 1 } } },
        'is not a rule @shadcn/lint defines',
      ],
      [
        'a path that no longer exists',
        { 'client/src/Gone.tsx': { 'shadcn/no-restyle': { count: 1 } } },
        'recorded path no longer exists',
      ],
      [
        'a path no design-rule lint reports on',
        { 'client/src/style.css': { 'shadcn/no-restyle': { count: 1 } } },
        'recorded but no design-rule lint reports on it',
      ],
    ];
    for (const [label, content, expected] of invalid) {
      const probe = writeBaseline(content);
      const rejected = staticChecks([probe, '--only', 'suppressions']);
      expect(rejected.status, `${label} was accepted`).toBe(1);
      expect(rejected.output, label).toContain(expected);
    }

    /** And a diff that deletes the baseline outright is the same kind of
     *  failure: the group still activates, the changed-file lint has no source
     *  to report through, so the check has to say so rather than skip. The
     *  deletion is exercised in a synthetic root, not in the checkout. */
    const emptyRoot = mkdtempSync(join(tmpdir(), 'lc-no-baseline-'));
    mkdirSync(join(emptyRoot, 'scripts'), { recursive: true });
    copyFileSync(
      resolve(repoRoot, 'scripts/static-checks.mts'),
      join(emptyRoot, 'scripts/static-checks.mts'),
    );
    copyFileSync(resolve(repoRoot, 'package.json'), join(emptyRoot, 'package.json'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(emptyRoot, 'node_modules'), 'dir');
    const deleted = run(
      process.execPath,
      [join(emptyRoot, 'scripts/static-checks.mts'), SUPPRESSIONS_FILE, '--only', 'suppressions'],
      { cwd: emptyRoot },
    );
    expect(deleted.status, 'a deleted baseline passed validation').not.toBe(0);
    expect(deleted.output).toContain('is missing');
    rmSync(emptyRoot, { force: true, recursive: true });

    /** Nothing in the checkout moved while that ran. */
    expect(readFileSync(suppressionsPath, 'utf8')).toBe(baselineText);
  });

  test('a change to how the primitives are built rebuilds them before the backlog is read @scenario:a-build-config-change-rebuilds-the-primitives-before-validation', () => {
    inOneProject();
    test.setTimeout(180_000);

    /** The design rules classify against `packages/client/dist`, which is build
     *  output and not in the tree. The runner rebuilds it when it is older than
     *  the library's sources — and the library's manifest and build config are
     *  sources in that sense too: they decide what is emitted and which entry
     *  point the rules resolve primitives through, while every file under `src`
     *  stays older than the last build. CI always builds, so a local run that
     *  trusted the old output would be the only one disagreeing.
     *
     *  The build is made observable rather than real: the miniature repository's
     *  `build:client-package` writes a marker, so the assertion is whether the
     *  runner asked for a build at all. */
    const root = syntheticRoot();
    const marker = join(root, 'built.marker');
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    manifest.scripts['build:client-package'] =
      `node -e "require('fs').writeFileSync('built.marker','1')"`;
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const checks = (files: string[]) =>
      run(
        process.execPath,
        [join(root, 'scripts/static-checks.mts'), ...files, '--only', 'suppressions'],
        { cwd: root },
      );

    try {
      /** A build newer than every source and every build input: no rebuild. */
      writeFileSync(join(root, 'packages/client/dist/index.js'), 'export {};\n');
      rmSync(marker, { force: true });
      const fresh = checks(['eslint.config.mjs']);
      expect(fresh.status, fresh.output).not.toBe(0);
      expect(existsSync(marker), 'a current build was rebuilt anyway').toBe(false);

      /** The build config moves, the sources do not: the build has to be asked
       *  for, because what `dist` holds was emitted under the old one. */
      writeFileSync(
        join(root, 'packages/client/tsdown.config.mjs'),
        `${readFileSync(join(root, 'packages/client/tsdown.config.mjs'), 'utf8')}\n// touched\n`,
      );
      const afterConfig = checks(['packages/client/tsdown.config.mjs']);
      expect(existsSync(marker), 'a build-config change kept the old metadata').toBe(true);
      expect(afterConfig.status, afterConfig.output).not.toBe(0);

      /** And the library's manifest, which names the entry point the rules
       *  resolve `@librechat/client` through. */
      writeFileSync(join(root, 'packages/client/dist/index.js'), 'export {};\n');
      rmSync(marker, { force: true });
      const packageJson = join(root, 'packages/client/package.json');
      writeFileSync(packageJson, readFileSync(packageJson, 'utf8'));
      const afterManifest = checks(['packages/client/package.json']);
      expect(existsSync(marker), 'a manifest change kept the old metadata').toBe(true);
      expect(afterManifest.status, afterManifest.output).not.toBe(0);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

/**
 * A miniature repository the runner can be pointed at: its own copy of this
 * script, the real flat config, the real manifests and a symlinked
 * `node_modules`, over two client sources and one library source. `ROOT` is
 * derived from the script's own location, so the copy treats this tree as the
 * repository — which is what makes a roots sweep affordable to assert.
 *
 * `packages/client/dist` is written last so the runner reads the design metadata
 * as fresh and does not rebuild the library; the rules still resolve the real
 * primitives through the symlinked `node_modules`.
 */
function syntheticRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'lc-synthetic-root-'));
  const write = (relative: string, content: string): void => {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  const copy = (relative: string): void => {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(resolve(repoRoot, relative), path);
  };

  for (const file of [
    'scripts/static-checks.mts',
    'package.json',
    'package-lock.json',
    'eslint.config.mjs',
    'packages/client/package.json',
    'packages/client/tsdown.config.mjs',
  ]) {
    copy(file);
  }
  symlinkSync(resolve(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');

  /** One caller that violates a design rule and is recorded nowhere, one that is
   *  clean and recorded with slack: between them, a sweep of the roots is the
   *  only run that can report both. */
  write('client/src/Caller.tsx', 'export default () => <div className="bg-pink-500" />;\n');
  write('client/src/Clean.tsx', 'export default () => <div className="bg-surface-primary" />;\n');
  write('client/src/Other.tsx', 'export default () => <div className="bg-surface-primary" />;\n');
  write('client/src/components/ui/Thing.tsx', 'export const Thing = () => null;\n');
  write('packages/client/src/Primitive.tsx', 'export const Primitive = () => null;\n');
  write('packages/client/dist/index.js', 'export {};\n');
  write(
    SUPPRESSIONS_FILE,
    `${JSON.stringify({ 'client/src/Clean.tsx': { 'shadcn/no-restyle': { count: 2 } } }, null, 2)}\n`,
  );
  return root;
}
