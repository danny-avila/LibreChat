import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * Static guard for the Amazon DocumentDB write and read surface.
 *
 * DocumentDB is a supported deployment target (see the root README and
 * `misc/documentdb/documentdb-compat.md`), but nothing in the normal test
 * pyramid can catch an incompatibility: every suite runs against
 * `mongodb-memory-server`, which is real MongoDB and accepts all of these
 * constructs. Each verdict below was established against a live DocumentDB
 * 5.0.0 cluster — the engine version this project documents as supported — and
 * the exact server error is recorded beside it.
 *
 * The scan walks the TypeScript AST rather than source text, so it also
 * catches a pipeline bound to a variable first, cast with `as`, or nested in a
 * `bulkWrite` operation's `update` property. If a construct here becomes
 * genuinely necessary, the fix is a compatible rewrite, not an exception list:
 * `misc/documentdb/audit.documentdb.spec.ts` re-adjudicates any of this
 * against a real cluster.
 */
const SOURCE_ROOT = path.join(__dirname, '..');

/** Aggregation-pipeline updates: `Failed to parse update: field must be of BSON type object`. */
const UPDATE_METHODS = new Set([
  'findOneAndUpdate',
  'findByIdAndUpdate',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
]);

/** `$$REMOVE`: `Feature not supported: $$REMOVE`. `$facet`: `Aggregation stage not supported`. */
const FORBIDDEN_TOKENS = ['$$REMOVE', '$$CURRENT', '$facet', '$graphLookup', '$unionWith'];

function collectSourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(target, found);
      continue;
    }
    if (/\.ts$/.test(entry.name) && !/\.(spec|test)\.ts$/.test(entry.name)) {
      found.push(target);
    }
  }
  return found;
}

function parse(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
}

/** Peels casts and parentheses so `[...] as PipelineStage[]` is still an array. */
function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** Names of variables initialized with array literals, so an indirect
 * `const update = [...]; Model.updateOne(filter, update)` is still caught.
 * Scope-naive by design: a false positive here names a variable that holds an
 * array and is passed as an update, which deserves a look regardless. */
function collectArrayVariableNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer != null &&
      ts.isArrayLiteralExpression(unwrapExpression(node.initializer))
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function isArrayValued(expression: ts.Expression, arrayNames: Set<string>): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return true;
  }
  if (ts.isIdentifier(unwrapped)) {
    return arrayNames.has(unwrapped.text);
  }
  if (ts.isConditionalExpression(unwrapped)) {
    return (
      isArrayValued(unwrapped.whenTrue, arrayNames) ||
      isArrayValued(unwrapped.whenFalse, arrayNames)
    );
  }
  return false;
}

function offenseAt(sourceFile: ts.SourceFile, node: ts.Node, label: string): string {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${line + 1} ${label}`;
}

/** Reports every update argument that is an array — the pipeline-update form —
 * whether passed directly to an update method or carried inside a `bulkWrite`
 * operation's `update` property. */
function findPipelineUpdates(fileName: string, source: string): string[] {
  const sourceFile = parse(fileName, source);
  const arrayNames = collectArrayVariableNames(sourceFile);
  const offenses: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      UPDATE_METHODS.has(node.expression.name.text) &&
      node.arguments.length >= 2 &&
      isArrayValued(node.arguments[1], arrayNames)
    ) {
      offenses.push(offenseAt(sourceFile, node, node.expression.name.text));
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'update' &&
      isArrayValued(node.initializer, arrayNames)
    ) {
      offenses.push(offenseAt(sourceFile, node, 'update property'));
    }
    if (
      ts.isShorthandPropertyAssignment(node) &&
      node.name.text === 'update' &&
      arrayNames.has(node.name.text)
    ) {
      offenses.push(offenseAt(sourceFile, node, 'update property'));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offenses;
}

/** Reports forbidden operator tokens in string literals and property names,
 * ignoring prose — the rewrites explain themselves by naming the construct. */
function findForbiddenTokens(fileName: string, source: string): string[] {
  const sourceFile = parse(fileName, source);
  const offenses: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isIdentifier(node)) {
      for (const token of FORBIDDEN_TOKENS) {
        if (node.text === token || node.text.startsWith(`${token}.`)) {
          offenses.push(offenseAt(sourceFile, node, token));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offenses;
}

describe('Amazon DocumentDB compatibility', () => {
  const sourceFiles = collectSourceFiles(SOURCE_ROOT);

  it('scans the package sources', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('uses no aggregation-pipeline updates', () => {
    const offenses = sourceFiles.flatMap((file) =>
      findPipelineUpdates(path.relative(SOURCE_ROOT, file), fs.readFileSync(file, 'utf8')),
    );
    expect(offenses).toEqual([]);
  });

  it('uses no aggregation constructs the engine rejects', () => {
    const offenses = sourceFiles.flatMap((file) =>
      findForbiddenTokens(path.relative(SOURCE_ROOT, file), fs.readFileSync(file, 'utf8')),
    );
    expect(offenses).toEqual([]);
  });

  /** A guard that cannot fail protects nothing, so every shape the detectors
   * exist to catch is proven against fixtures here rather than by trusting a
   * one-time manual injection. */
  describe('detector coverage', () => {
    it.each([
      ['direct literal', `Model.updateOne(filter, [{ $set: { a: 1 } }]);`],
      ['cast literal', `Model.updateMany(filter, [{ $set: { a: 1 } }] as PipelineStage[]);`],
      [
        'indirect variable',
        `const update = [{ $set: { a: 1 } }];\nModel.findOneAndUpdate(filter, update);`,
      ],
      [
        'conditional branch',
        `Model.updateOne(filter, flag ? [{ $set: { a: 1 } }] : { $set: { a: 1 } });`,
      ],
      [
        'bulkWrite operation payload',
        `await Model.bulkWrite([{ updateOne: { filter, update: [{ $set: { a: 1 } }] } }]);`,
      ],
      [
        'bulkWrite indirect payload',
        `const update = [{ $set: { a: 1 } }];\nawait Model.bulkWrite([{ updateMany: { filter, update } }]);`,
      ],
    ])('flags a pipeline update: %s', (_shape, source) => {
      expect(findPipelineUpdates('fixture.ts', source)).not.toEqual([]);
    });

    it.each([
      ['classic update', `Model.updateOne(filter, { $set: { a: 1 } });`],
      [
        'classic bulk payload',
        `await Model.bulkWrite([{ updateOne: { filter, update: { $set: { a: 1 } } } }]);`,
      ],
      ['unrelated array variable', `const stages = [{ $match: {} }];\nModel.aggregate(stages);`],
    ])('accepts a supported shape: %s', (_shape, source) => {
      expect(findPipelineUpdates('fixture.ts', source)).toEqual([]);
    });

    it('flags forbidden operators in code but not in prose', () => {
      expect(
        findForbiddenTokens('fixture.ts', `const projection = { x: '$$REMOVE' };`),
      ).not.toEqual([]);
      expect(
        findForbiddenTokens('fixture.ts', `pipeline.push({ $facet: { rows: [] } });`),
      ).not.toEqual([]);
      expect(
        findForbiddenTokens('fixture.ts', `/** $$REMOVE and $facet are unsupported. */`),
      ).toEqual([]);
    });
  });
});
