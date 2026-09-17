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
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { repoRoot, run, staticChecks } from './lint.helpers';

/**
 * `eslint-suppressions.json` records what the tree already owed when the design
 * rules landed, as a count per file and rule. Three things about that record are
 * behaviour a contributor meets: the commit that FIXES one of those violations
 * must not be rejected for leaving the count too high, a file move must not leave
 * the old path silencing a future file that reuses it, and a diff that edits only
 * the record must still be looked at by something. None of the three needs the
 * browser; each runs the configured command and reads what it does.
 */

type Suppressions = Record<string, Record<string, { count: number }>>;
const SUPPRESSIONS_FILE = 'eslint-suppressions.json';
const suppressionsPath = resolve(repoRoot, SUPPRESSIONS_FILE);
const ESLINT = resolve(repoRoot, 'node_modules/.bin/eslint');

const readBaseline = (): Suppressions =>
  JSON.parse(readFileSync(suppressionsPath, 'utf8')) as Suppressions;

/** A scratch baseline; ESLint takes its location as an argument. */
function writeBaseline(name: string, content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'lc-suppressions-')), name);
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
    test.setTimeout(180_000);

    /** Pick a real recorded file and claim one more violation than it has, which
     *  is the state a fix leaves behind until the counts are pruned. */
    const baseline = readBaseline();
    const [file, rules] = Object.entries(baseline)[0];
    const [rule, { count }] = Object.entries(rules)[0];
    const overCounted = writeBaseline(SUPPRESSIONS_FILE, {
      [file]: { [rule]: { count: count + 1 } },
    });
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

    /** The runner and the CI step pass the same flag, and what that is worth is
     *  what the two runs above measure. Reading it back out of their source text
     *  would pin wiring, so it is not asserted here; the flag's absence shows up
     *  as the exit 2 above, and `npm run static-checks` on a real fixing diff is
     *  the run that exercises the runner's own copy. */

    /** The other half of the policy: the commit stays possible, and the lane
     *  then asks for the prune. Capacity a fix freed is capacity the next change
     *  could spend, so the suppressions check rejects a count higher than the
     *  file's violations and names the command that tightens it. */
    const scratch = resolve(repoRoot, 'e2e/specs/.test-results/unused-capacity');
    mkdirSync(scratch, { recursive: true });
    writeFileSync(
      join(scratch, SUPPRESSIONS_FILE),
      `${JSON.stringify({ [file]: { [rule]: { count: count + 3 } } }, null, 2)}\n`,
    );
    const capacity = staticChecks([join(scratch, SUPPRESSIONS_FILE), '--only', 'suppressions']);
    expect(capacity.status, 'unused suppression capacity passed the lane').not.toBe(0);
    expect(capacity.output).toContain('would silence a later violation');
    expect(capacity.output).toContain('npm run lint:design:prune');
    rmSync(scratch, { force: true, recursive: true });

    /** The re-record has to survive the backlog it is recording. `--suppress-rule`
     *  names the design rules, but the run still reports every other rule in the
     *  roots, and those roots carry a pre-existing error backlog, so the
     *  re-record exits non-zero on a perfectly good write. What matters is that
     *  the write happened, which is why the documented chain does not gate the
     *  prune on that status. */
    const recorded = join(mkdtempSync(join(tmpdir(), 'lc-record-')), SUPPRESSIONS_FILE);
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

    const scratch = writeBaseline(SUPPRESSIONS_FILE, {
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

  test('a suppressions-only change is selected and validated by static checks @scenario:a-suppressions-only-change-is-selected-and-validated-by-static-checks', () => {
    test.setTimeout(180_000);

    /** The two ways a diff reaches this check are asserted by running them, not
     *  by reading the lane's YAML: the baseline itself, and the config that
     *  decides what every recorded count stands for. A config-only target has
     *  no recorded file of its own, so the check has to reach for the whole
     *  record, and an inflated count on an untouched caller is what proves it
     *  did. Which CI paths select it is the lane's own business — and the lane
     *  running green on this pull request is the evidence for it. */

    const caller = Object.keys(readBaseline()).find((path) => path.startsWith('client/src/'));
    if (!caller) {
      throw new Error('the baseline records no client/src caller; pick another fixture');
    }
    const callerRule = Object.keys(readBaseline()[caller])[0];
    const slack = writeBaseline(SUPPRESSIONS_FILE, {
      [caller]: { [callerRule]: { count: readBaseline()[caller][callerRule].count + 4 } },
    });
    const configOnly = staticChecks([slack, 'eslint.config.mjs', '--only', 'suppressions']);
    expect(configOnly.status, 'a config-only change validated no recorded file').not.toBe(0);
    expect(configOnly.output).toContain(caller);
    expect(configOnly.output).toContain('would silence a later violation');

    /** The plugin arrives through the manifests, so a dependency-only diff is
     *  the third way the rules' own behaviour changes without a source file
     *  moving — an upgrade that classifies one more class leaves every recorded
     *  count standing for something else. */
    /** And the edit is measured against `HEAD` when no range is given, which is
     *  the pre-commit case: a diff that also touches one recorded source would
     *  otherwise narrow the check to that source and let every other count edit
     *  through. Passing the recorded source alongside the baseline is that
     *  shape. */
    const recordedSource = Object.keys(readBaseline()).find(
      (path) => path !== caller && path.startsWith('client/src/'),
    );
    if (!recordedSource) {
      throw new Error('the baseline records only one client/src file; pick another fixture');
    }
    const alongside = staticChecks([slack, recordedSource, '--only', 'suppressions']);
    expect(alongside.status, 'a count edit rode along with a recorded source').not.toBe(0);
    expect(alongside.output).toContain(caller);

    const dependencyOnly = staticChecks([slack, 'package-lock.json', '--only', 'suppressions']);
    expect(dependencyOnly.status, 'a dependency-only change validated no recorded file').not.toBe(
      0,
    );
    expect(dependencyOnly.output).toContain(caller);

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

    /** An inline comment is the one way to silence a design rule that leaves
     *  nothing behind to review, and a file with no entry could otherwise carry
     *  one past every other check. The check lints the diff's design sources
     *  twice — with and without `--no-inline-config` — so every spelling is
     *  caught and text that only looks like a directive is not. */
    const directive = join(repoRoot, 'client/src/__directive_probe__.tsx');
    const silenced = [
      ['a named disable', '/* eslint-disable shadcn/no-raw-colors */'],
      ['a justified disable', '/* eslint-disable shadcn/no-raw-colors -- because */'],
      ['a blanket disable', '/* eslint-disable */'],
      ['rule configuration', '/* eslint shadcn/no-raw-colors: off */'],
    ];
    try {
      for (const [label, comment] of silenced) {
        writeFileSync(
          directive,
          `${comment}\nexport default () => <div className="bg-pink-500" />;\n`,
        );
        const report = staticChecks([
          'client/src/__directive_probe__.tsx',
          '--only',
          'suppressions',
        ]);
        expect(report.status, `${label} passed`).not.toBe(0);
        expect(report.output, label).toContain(
          'shadcn/no-raw-colors is silenced by an inline comment',
        );
      }

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
        writeFileSync(directive, source);
        const report = staticChecks([
          'client/src/__directive_probe__.tsx',
          '--only',
          'suppressions',
        ]);
        expect(report.status, `${label}: ${report.output}`).toBe(0);
      }
    } finally {
      rmSync(directive, { force: true });
    }

    /** Part two: the record is actually read. The committed baseline passes. */
    const passing = staticChecks([SUPPRESSIONS_FILE, '--only', 'suppressions']);
    expect(passing.status, passing.output).toBe(0);

    /** And each way it can stop saying what it claims fails, naming the key. The
     *  check validates every suppressions file the target names, so the invalid
     *  ones live under the lane's own ignored results directory and the
     *  repository's baseline is never written to. */
    const scratchDir = resolve(repoRoot, 'e2e/specs/.test-results/suppression-probe');
    const baselineText = readFileSync(suppressionsPath, 'utf8');
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
    ];
    mkdirSync(scratchDir, { recursive: true });
    for (const [label, content, expected] of invalid) {
      const probe = join(scratchDir, SUPPRESSIONS_FILE);
      writeFileSync(probe, `${JSON.stringify(content, null, 2)}\n`);
      const rejected = staticChecks([probe, '--only', 'suppressions']);
      expect(rejected.status, `${label} was accepted`).toBe(1);
      expect(rejected.output, label).toContain(expected);
    }
    rmSync(scratchDir, { force: true, recursive: true });

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
    const deleted = run(process.execPath, [
      join(emptyRoot, 'scripts/static-checks.mts'),
      SUPPRESSIONS_FILE,
      '--only',
      'suppressions',
    ]);
    expect(deleted.status, 'a deleted baseline passed validation').not.toBe(0);
    expect(deleted.output).toContain('is missing');
    rmSync(emptyRoot, { force: true, recursive: true });

    /** A primitive's variants decide what the caller rules report, so a diff
     *  that changes a component-library source has to revalidate the record for
     *  files it never touches — the same reach the config-only run above
     *  proves, from the other entry point. */
    const primitive = 'packages/client/src/components/Textarea.tsx';
    expect(existsSync(resolve(repoRoot, primitive))).toBe(true);
    const fanOut = staticChecks([slack, primitive, '--only', 'suppressions']);
    expect(fanOut.status, 'a library change skipped the recorded callers').not.toBe(0);
    expect(fanOut.output).toContain(caller);

    /** Nothing in the checkout moved while that ran. */
    expect(readFileSync(suppressionsPath, 'utf8')).toBe(baselineText);
  });
});
