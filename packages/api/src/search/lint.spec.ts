import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Linter } from 'eslint';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'eslint');

/** Covered by the type-safety block. */
const SCOPED_FILE = 'packages/api/src/search/scope.ts';
/** Not covered, and one of the ~1,500 places the repository already uses the form. */
const UNSCOPED_FILE = 'packages/api/src/utils/common.ts';

const DOUBLE_ASSERTION = 'export const x = (1 as unknown) as string;\n';
const RECORD_UNKNOWN = 'export function f(o: Record<string, unknown>): void {\n  void o;\n}\n';

type LintResult = {
  messages: Linter.LintMessage[];
};

/**
 * The flat config is an ES module, which a CJS Jest worker cannot import, so the
 * real CLI is driven instead of the `ESLint` class. That also makes this the same
 * resolution path CI takes rather than an approximation of it.
 */
function runEslint(args: string[], stdin?: string): string {
  try {
    return execFileSync(ESLINT_BIN, args, {
      cwd: REPO_ROOT,
      input: stdin,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    /** A non-zero exit is how eslint reports findings; the JSON is still on stdout. */
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout === 'string' && stdout.length > 0) {
      return stdout;
    }
    throw error;
  }
}

function restrictedSyntaxMessages(filePath: string, source: string): Linter.LintMessage[] {
  const output = runEslint(['--stdin', '--stdin-filename', filePath, '--format', 'json'], source);
  const [result] = JSON.parse(output) as LintResult[];
  const fatal = result.messages.filter((message) => message.fatal);
  expect(fatal).toEqual([]);
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax');
}

/**
 * The type-safety conventions in CLAUDE.md are enforced by a `no-restricted-syntax`
 * block in `eslint.config.mjs`, and nothing about that block is self-announcing:
 * the option array replaces rather than merges across blocks, so a later block
 * matching the same paths drops every selector silently, and reordering does the
 * same. Neither failure makes any file fail to lint — the rule just stops existing,
 * and no test fails.
 *
 * So the resolved configuration is asserted directly, and real violations are
 * linted end to end. The second half also pins the AST selectors: `TSAsExpression`
 * and `TSUnknownKeyword` are node types rather than field names, chosen because
 * @typescript-eslint has renamed fields beneath them before (`typeParameters`
 * became `typeArguments` in v6) without renaming the nodes.
 */
describe('chat search type-safety lint rule', () => {
  it('resolves to an error carrying every selector for a scoped file', () => {
    const config = JSON.parse(runEslint(['--print-config', SCOPED_FILE])) as Linter.Config;
    const entry = config.rules?.['no-restricted-syntax'];
    expect(Array.isArray(entry)).toBe(true);
    const [severity, ...options] = entry as [Linter.Severity, ...{ selector: string }[]];
    expect(severity).toBe(2);
    expect(options.map((option) => option.selector)).toEqual([
      "CallExpression[callee.property.name='bulkWrite']",
      "MemberExpression[property.name='collection'][parent.type='MemberExpression']",
      'TSAsExpression[expression.type="TSAsExpression"][expression.typeAnnotation.type="TSUnknownKeyword"]',
      'TSTypeReference[typeName.name="Record"] > TSTypeParameterInstantiation > TSUnknownKeyword',
    ]);
  }, 60_000);

  it('reports a double assertion through unknown in a scoped file', () => {
    const messages = restrictedSyntaxMessages(SCOPED_FILE, DOUBLE_ASSERTION);
    expect(messages).toHaveLength(1);
    expect(messages[0].severity).toBe(2);
    expect(messages[0].message).toMatch(/Avoid `as unknown as T`/);
  }, 60_000);

  it('reports an inline Record<string, unknown> in a scoped file', () => {
    const messages = restrictedSyntaxMessages(SCOPED_FILE, RECORD_UNKNOWN);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toMatch(/Avoid `Record<string, unknown>`/);
  }, 60_000);

  /**
   * The repository holds well over a thousand of these outside the scoped paths,
   * and the rule is a ratchet on new code rather than a full-tree invariant. A
   * `files` entry that grew a wider glob would turn the whole build red, so the
   * negative case is asserted rather than assumed.
   */
  it('leaves both forms alone outside the scoped paths', () => {
    expect(restrictedSyntaxMessages(UNSCOPED_FILE, DOUBLE_ASSERTION)).toEqual([]);
    expect(restrictedSyntaxMessages(UNSCOPED_FILE, RECORD_UNKNOWN)).toEqual([]);
  }, 60_000);
});
