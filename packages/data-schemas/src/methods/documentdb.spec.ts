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
 * `bulkWrite` operation's `update` property. Besides constructs the engine
 * rejects outright, it holds every index build to the retrying helpers in
 * `utils/retry.ts`, because the engine admits one build per collection at a
 * time and a concurrent second build fails silently in any caller that only
 * logs. It covers every backend workspace
 * that talks to MongoDB — this package, `packages/api`, and `api` — because the
 * regression class is repo-wide and new backend code lands in `packages/api`.
 * Dataflow is followed within a file only — a pipeline imported from another
 * module is out of reach — and the method sweep and the live cluster run are
 * the completeness backstops, not this guard.
 * If a construct here becomes genuinely necessary, the fix is a compatible
 * rewrite, not an exception list: `misc/documentdb/audit.documentdb.spec.ts`
 * re-adjudicates any of this against a real cluster.
 */
const REPO_ROOT = path.join(__dirname, '../../../..');
const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'packages/data-schemas/src'),
  path.join(REPO_ROOT, 'packages/api/src'),
  path.join(REPO_ROOT, 'api'),
];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.turbo']);

/** Aggregation-pipeline updates: `Failed to parse update: field must be of BSON type object`. */
const UPDATE_METHODS = new Set([
  'findOneAndUpdate',
  'findByIdAndUpdate',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
]);

/**
 * Every operator AWS documents as unsupported in the 5.0 column of "Supported
 * MongoDB APIs, operations, and data types", grouped as that table groups them.
 * The first two carry the exact server errors observed live — `$$REMOVE`:
 * `Feature not supported: $$REMOVE`; `$facet`: `Aggregation stage not
 * supported`. `$pow`, `$rand`, `$dateFromParts` and `$dateToParts` arrive in
 * 5.0.1, after the 5.0.0 engine these verdicts were established on. `$set`,
 * `$unset` and `$count` are legal in one position and rejected in another, so
 * they have their own detectors below.
 */
const FORBIDDEN_TOKENS = [
  '$$REMOVE',
  '$$CURRENT',
  // stages
  '$facet',
  '$graphLookup',
  '$unionWith',
  '$setWindowFields',
  '$bucket',
  '$bucketAuto',
  '$merge',
  '$replaceWith',
  '$sortByCount',
  '$vectorSearch',
  '$listSearchIndexes',
  '$planCacheStats',
  '$listSessions',
  '$listLocalSessions',
  // accumulators
  '$accumulator',
  '$rank',
  '$denseRank',
  '$documentNumber',
  '$shift',
  '$derivative',
  '$integral',
  '$expMovingAvg',
  '$covariancePop',
  '$covarianceSamp',
  '$stdDevPop',
  '$stdDevSamp',
  '$top',
  '$topN',
  '$bottom',
  '$bottomN',
  '$firstN',
  '$lastN',
  '$maxN',
  '$minN',
  '$median',
  '$percentile',
  // expressions
  '$round',
  '$trunc',
  '$pow',
  '$rand',
  '$sortArray',
  '$binarySize',
  '$bsonSize',
  '$dateTrunc',
  '$dateFromParts',
  '$dateToParts',
  '$isNumber',
  '$toUUID',
  '$getField',
  '$sampleRate',
  '$sigmoid',
  '$bitAnd',
  '$bitNot',
  '$bitOr',
  '$bitXor',
  '$tsIncrement',
  '$tsSecond',
  '$acos',
  '$acosh',
  '$asin',
  '$asinh',
  '$atan',
  '$atan2',
  '$atanh',
  '$cos',
  '$cosh',
  '$sin',
  '$sinh',
  '$tan',
  '$tanh',
  '$degreesToRadians',
  '$radiansToDegrees',
  // query and cursor options
  '$where',
  'allowDiskUse',
  'noCursorTimeout',
];

/** `$set` and `$unset` are update operators everywhere in this codebase and are
 * supported as such; as pipeline STAGES (the `$addFields` / `$project` aliases)
 * DocumentDB 5.0 rejects them. A stage is an object that is an element of an
 * array, which no update-operator position is: an update document is a call
 * argument or an `update` property, and a `bulkWrite` element keys on its
 * operation name. */
const ALIAS_STAGES = new Set(['$set', '$unset']);

/** Index builds. The engine admits one build per collection at a time and
 * rejects a second with code 40333 (`utils/retry.ts`), so every build must go
 * through `createIndexesWithRetry` or `buildIndexWithRetry`, which poll for the
 * slot. A raw call is legal only inside the helper module itself or as the
 * argument of `buildIndexWithRetry`. */
const INDEX_BUILD_METHODS = new Set([
  'createIndex',
  'createIndexes',
  'syncIndexes',
  'ensureIndexes',
]);
const INDEX_BUILD_HELPER = 'packages/data-schemas/src/utils/retry.ts';
const INDEX_BUILD_WRAPPER = 'buildIndexWithRetry';
/** Modules that name forbidden operators in order to reject them. */
const OPERATOR_GUARDS = new Set(['packages/data-schemas/src/tenant/probe.ts']);

function collectSourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(target, found);
      continue;
    }
    if (/\.(ts|js)$/.test(entry.name) && !/\.(spec|test)\.[tj]s$|\.d\.ts$/.test(entry.name)) {
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

function isArrayType(type: ts.TypeNode | undefined): boolean {
  if (type == null) {
    return false;
  }
  if (ts.isArrayTypeNode(type)) {
    return true;
  }
  return (
    ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === 'Array'
  );
}

function isArrayExpression(expression: ts.Expression, arrayNames: Set<string>): boolean {
  const unwrapped = unwrapExpression(expression);
  return (
    ts.isArrayLiteralExpression(unwrapped) ||
    (ts.isIdentifier(unwrapped) && arrayNames.has(unwrapped.text))
  );
}

/** Whether a function is declared to return an array, or returns one from its
 * own body — an array literal, or a variable bound to one (nested functions
 * are not descended into). */
function returnsArray(fn: ts.FunctionLikeDeclaration, arrayNames: Set<string>): boolean {
  if (isArrayType(fn.type)) {
    return true;
  }
  if (fn.body == null) {
    return false;
  }
  if (!ts.isBlock(fn.body)) {
    return isArrayExpression(fn.body, arrayNames);
  }
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found || ts.isFunctionLike(node)) {
      return;
    }
    if (
      ts.isReturnStatement(node) &&
      node.expression != null &&
      isArrayExpression(node.expression, arrayNames)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return found;
}

function isArrayReturningFunction(expression: ts.Expression, arrayNames: Set<string>): boolean {
  return (
    (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) &&
    returnsArray(expression, arrayNames)
  );
}

/** Names of variables initialized with array literals, then of functions and
 * methods that return one — an array literal or one of those variables — so an
 * indirect `const update = [...]; Model.updateOne(filter, update)`, a
 * `Model.updateMany(filter, buildPipeline(ids))` or a `builder.pipeline()` is
 * still caught. Scope-naive by design: a false positive here names something
 * that holds an array and is passed as an update, which deserves a look
 * regardless. */
function collectArrayValuedNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visitVariables = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      (isArrayType(node.type) ||
        (node.initializer != null &&
          ts.isArrayLiteralExpression(unwrapExpression(node.initializer))))
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visitVariables);
  };
  visitVariables(sourceFile);
  const visitFunctions = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer != null &&
      isArrayReturningFunction(unwrapExpression(node.initializer), names)
    ) {
      names.add(node.name.text);
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name != null &&
      ts.isIdentifier(node.name) &&
      returnsArray(node, names)
    ) {
      names.add(node.name.text);
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      isArrayReturningFunction(unwrapExpression(node.initializer), names)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visitFunctions);
  };
  visitFunctions(sourceFile);
  return names;
}

/** Object literals bound to variable names, so a stage held in a variable and
 * pushed or listed later is still inspected. Scope-naive like the array names. */
function collectObjectValuedNames(
  sourceFile: ts.SourceFile,
): Map<string, ts.ObjectLiteralExpression> {
  const objects = new Map<string, ts.ObjectLiteralExpression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer != null) {
      const initializer = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        objects.set(node.name.text, initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return objects;
}

function calleeName(call: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(call.expression)) {
    return call.expression.text;
  }
  return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : undefined;
}

function isArrayValued(expression: ts.Expression, arrayNames: Set<string>): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return true;
  }
  if (ts.isIdentifier(unwrapped)) {
    return arrayNames.has(unwrapped.text);
  }
  if (ts.isCallExpression(unwrapped)) {
    const name = calleeName(unwrapped);
    return name != null && arrayNames.has(name);
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
function findPipelineUpdates(sourceFile: ts.SourceFile): string[] {
  const arrayNames = collectArrayValuedNames(sourceFile);
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
 * ignoring prose — the rewrites explain themselves by naming the construct —
 * and type members, which never reach the engine (Mongoose documents declare
 * a `$where` field). */
function findForbiddenTokens(sourceFile: ts.SourceFile): string[] {
  if (OPERATOR_GUARDS.has(sourceFile.fileName)) {
    return [];
  }
  const offenses: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteralLike(node) ||
      (ts.isIdentifier(node) && !ts.isPropertySignature(node.parent))
    ) {
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

/** Reports `.select('...')` string arguments that mix a bare inclusion token
 * with a `+` token where the bare tokens are ONLY `_id`. `_id` alone does not
 * make a Mongoose projection inclusive and a `+` token only un-hides its
 * field, so this exact shape compiles to `{ _id: 1 }` plus a `: 0` exclusion
 * for every OTHER `select: false` sibling — a mixed projection MongoDB
 * tolerates via the `_id` exception but Amazon DocumentDB rejects:
 * `Projections cannot have a mix of inclusion and exclusion`. Every related
 * shape stays legal and is deliberately not flagged (verified empirically): a
 * bare non-`_id` token makes the projection inclusive, turning `+` tokens
 * into plain `field: 1` inclusions; pure-`+` strings compile to
 * all-exclusion; object-form selects are sent verbatim. */
function findMixedSelectStrings(sourceFile: ts.SourceFile): string[] {
  const offenses: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'select' &&
      node.arguments.length === 1
    ) {
      const argument = unwrapExpression(node.arguments[0]);
      if (ts.isStringLiteralLike(argument)) {
        const tokens = argument.text.split(/\s+/).filter((token) => token.length > 0);
        const bare = tokens.filter((token) => !token.startsWith('+') && !token.startsWith('-'));
        const hasUnhide = tokens.some((token) => token.startsWith('+'));
        if (hasUnhide && bare.length > 0 && bare.every((token) => token === '_id')) {
          offenses.push(offenseAt(sourceFile, node, `select('${argument.text}')`));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offenses;
}

function propertyName(property: ts.ObjectLiteralElementLike): string | undefined {
  const name = property.name;
  if (name == null || !(ts.isIdentifier(name) || ts.isStringLiteral(name))) {
    return undefined;
  }
  return name.text;
}

/** Array methods whose object arguments become elements of the receiver. */
const ARRAY_APPENDERS = new Set(['push', 'unshift', 'concat']);

function aliasStageOffenses(
  sourceFile: ts.SourceFile,
  element: ts.Expression,
  objects: Map<string, ts.ObjectLiteralExpression>,
): string[] {
  const unwrapped = unwrapExpression(element);
  if (ts.isConditionalExpression(unwrapped)) {
    return [
      ...aliasStageOffenses(sourceFile, unwrapped.whenTrue, objects),
      ...aliasStageOffenses(sourceFile, unwrapped.whenFalse, objects),
    ];
  }
  const stage = ts.isIdentifier(unwrapped) ? objects.get(unwrapped.text) : unwrapped;
  if (stage == null || !ts.isObjectLiteralExpression(stage)) {
    return [];
  }
  return stage.properties
    .filter((property) => ALIAS_STAGES.has(propertyName(property) ?? ''))
    .map((property) => offenseAt(sourceFile, property, `${propertyName(property)} stage`));
}

/** The expressions that become elements of an array: the elements of a literal,
 * and the arguments of `push` / `unshift` / `concat`, which is how a pipeline
 * is assembled dynamically. */
function arrayElements(node: ts.Node): readonly ts.Expression[] {
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ARRAY_APPENDERS.has(node.expression.name.text)
  ) {
    return node.arguments;
  }
  return [];
}

/** Reports `$set` / `$unset` objects in element position — inside an array
 * literal or appended to one, on either side of a conditional — wherever the
 * pipeline is assembled. */
function findAliasStages(sourceFile: ts.SourceFile): string[] {
  const objects = collectObjectValuedNames(sourceFile);
  const offenses: string[] = [];
  const visit = (node: ts.Node): void => {
    offenses.push(
      ...arrayElements(node).flatMap((element) => aliasStageOffenses(sourceFile, element, objects)),
    );
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offenses;
}

/** `$count` is a supported STAGE (`{ $count: 'total' }`) but an unsupported
 * ACCUMULATOR (`{ n: { $count: {} } }`) on 5.0; the two differ by value shape. */
function findAccumulatorCounts(sourceFile: ts.SourceFile): string[] {
  const offenses: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node) === '$count' &&
      ts.isObjectLiteralExpression(unwrapExpression(node.initializer))
    ) {
      offenses.push(offenseAt(sourceFile, node, '$count accumulator'));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offenses;
}

function isWrappedIndexBuild(node: ts.Node): boolean {
  for (let current = node.parent; current != null; current = current.parent) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === INDEX_BUILD_WRAPPER
    ) {
      return true;
    }
  }
  return false;
}

/** Meilisearch's client shares the `createIndex` name; its options carry a
 * `primaryKey`, which no MongoDB index option does. */
function isMeilisearchIndexCall(call: ts.CallExpression): boolean {
  const options = call.arguments[1] == null ? undefined : unwrapExpression(call.arguments[1]);
  return (
    options != null &&
    ts.isObjectLiteralExpression(options) &&
    options.properties.some((property) => propertyName(property) === 'primaryKey')
  );
}

/** Reports every index build that bypasses the retrying helpers. */
function findRawIndexBuilds(sourceFile: ts.SourceFile): string[] {
  if (sourceFile.fileName === INDEX_BUILD_HELPER) {
    return [];
  }
  const offenses: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      INDEX_BUILD_METHODS.has(node.expression.name.text) &&
      !isWrappedIndexBuild(node) &&
      !isMeilisearchIndexCall(node)
    ) {
      offenses.push(offenseAt(sourceFile, node, `raw ${node.expression.name.text}`));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offenses;
}

describe('Amazon DocumentDB compatibility', () => {
  /** Each file is read and parsed once; every detector walks the same tree. */
  const parsedSources = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root)).map((file) =>
    parse(path.relative(REPO_ROOT, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')),
  );

  it('scans the backend workspaces', () => {
    expect(parsedSources.length).toBeGreaterThan(0);
  });

  it('uses no aggregation-pipeline updates', () => {
    expect(parsedSources.flatMap(findPipelineUpdates)).toEqual([]);
  });

  it('uses no aggregation constructs the engine rejects', () => {
    expect(parsedSources.flatMap(findForbiddenTokens)).toEqual([]);
  });

  it('mixes no bare and un-hide tokens in select strings', () => {
    expect(parsedSources.flatMap(findMixedSelectStrings)).toEqual([]);
  });

  it('uses no $set or $unset pipeline stages', () => {
    expect(parsedSources.flatMap(findAliasStages)).toEqual([]);
  });

  it('uses no $count accumulators', () => {
    expect(parsedSources.flatMap(findAccumulatorCounts)).toEqual([]);
  });

  it('builds every index through the retrying helpers', () => {
    expect(parsedSources.flatMap(findRawIndexBuilds)).toEqual([]);
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
      [
        'pipeline returned by a declared function',
        `function pipeline(ids: string[]): PipelineStage[] {\n  return [{ $set: { ids } }];\n}\nModel.updateMany(filter, pipeline(ids));`,
      ],
      [
        'pipeline returned by an arrow with an expression body',
        `const pipeline = (ids: string[]) => [{ $set: { ids } }];\nModel.updateOne(filter, pipeline(ids));`,
      ],
      [
        'pipeline returned by an untyped function body',
        `function pipeline() {\n  const stage = { $set: { a: 1 } };\n  return [stage] as PipelineStage[];\n}\nModel.findOneAndUpdate(filter, pipeline());`,
      ],
      [
        'pipeline returned by a class method',
        `class Builder {\n  pipeline(): PipelineStage[] {\n    return [{ $addFields: { a: 1 } }];\n  }\n}\nModel.updateMany(filter, new Builder().pipeline());`,
      ],
      [
        'pipeline returned by an object method',
        `const builder = { pipeline: () => [{ $addFields: { a: 1 } }] };\nModel.updateOne(filter, builder.pipeline());`,
      ],
      [
        'pipeline returned through a local variable',
        `function pipeline() {\n  const stages = [{ $addFields: { a: 1 } }];\n  return stages;\n}\nModel.updateMany(filter, pipeline());`,
      ],
      [
        'annotated variable with a builder initializer',
        `const update: PipelineStage[] = importedBuilder();\nModel.updateMany(filter, update);`,
      ],
    ])('flags a pipeline update: %s', (_shape, source) => {
      expect(findPipelineUpdates(parse('fixture.ts', source))).not.toEqual([]);
    });

    it.each([
      ['classic update', `Model.updateOne(filter, { $set: { a: 1 } });`],
      [
        'classic bulk payload',
        `await Model.bulkWrite([{ updateOne: { filter, update: { $set: { a: 1 } } } }]);`,
      ],
      ['unrelated array variable', `const stages = [{ $match: {} }];\nModel.aggregate(stages);`],
      [
        'update document returned by a function',
        `function update() {\n  return { $set: { a: 1 } };\n}\nModel.updateOne(filter, update());`,
      ],
    ])('accepts a supported shape: %s', (_shape, source) => {
      expect(findPipelineUpdates(parse('fixture.ts', source))).toEqual([]);
    });

    it.each([
      ['_id with an un-hide token', `Model.find({}).select('_id +hiddenField');`],
      ['regardless of token order', `Model.find({}).select('+hiddenField _id');`],
    ])('flags a mixed select string: %s', (_shape, source) => {
      expect(findMixedSelectStrings(parse('fixture.ts', source))).not.toEqual([]);
    });

    it.each([
      ['pure un-hide tokens', `Model.find({}).select('+hiddenA +hiddenB');`],
      ['pure inclusion string', `Model.find({}).select('_id title user');`],
      ['bare non-_id token makes it inclusive', `Model.find({}).select('title +hiddenField');`],
      ['object-form inclusion', `Model.find({}).select({ _id: 1, hiddenField: 1 });`],
      ['bare with minus exclusion', `Model.find({}).select('-internal');`],
    ])('accepts a supported select: %s', (_shape, source) => {
      expect(findMixedSelectStrings(parse('fixture.ts', source))).toEqual([]);
    });

    it('flags forbidden operators in code but not in prose or type members', () => {
      expect(
        findForbiddenTokens(parse('fixture.ts', `const projection = { x: '$$REMOVE' };`)),
      ).not.toEqual([]);
      expect(
        findForbiddenTokens(parse('fixture.ts', `pipeline.push({ $facet: { rows: [] } });`)),
      ).not.toEqual([]);
      expect(
        findForbiddenTokens(parse('fixture.ts', `const stage = { $setWindowFields: {} };`)),
      ).not.toEqual([]);
      expect(
        findForbiddenTokens(parse('fixture.ts', `/** $$REMOVE and $facet are unsupported. */`)),
      ).toEqual([]);
      expect(
        findForbiddenTokens(
          parse('fixture.ts', `interface Doc { $where: Record<string, unknown> }`),
        ),
      ).toEqual([]);
    });

    it.each([
      ['stage after a match', `Model.aggregate([{ $match: {} }, { $set: { a: 1 } }]);`],
      ['unset stage held in a variable', `const stages = [{ $unset: 'a' }];`],
      ['stage appended to a spread scope', `Model.aggregate([...scope, { $set: { a: 1 } }]);`],
      [
        'stage pushed onto a pipeline',
        `const stages = [];\nstages.push({ $match: {} }, { $set: { a: 1 } });\nModel.aggregate(stages);`,
      ],
      ['stage prepended with unshift', `stages.unshift({ $unset: 'a' });`],
      ['stage concatenated onto a base', `const stages = base.concat({ $set: { a: 1 } });`],
      [
        'stage chosen by a conditional element',
        `Model.aggregate([...scope, flag ? { $set: { a: 1 } } : { $addFields: { a: 1 } }]);`,
      ],
      [
        'stage held in a variable and pushed',
        `const stage = { $set: { a: 1 } };\nstages.push(stage);`,
      ],
      [
        'stage held in a variable and listed',
        `const stage = { $unset: 'a' };\nconst stages = [stage];`,
      ],
    ])('flags an alias stage: %s', (_shape, source) => {
      expect(findAliasStages(parse('fixture.ts', source))).not.toEqual([]);
    });

    it.each([
      ['classic update operator', `Model.updateOne(filter, { $set: { a: 1 } });`],
      [
        'bulkWrite operation payload',
        `await Model.bulkWrite([{ updateOne: { filter, update: { $set: { a: 1 } } } }]);`,
      ],
      ['addFields stage', `Model.aggregate([{ $addFields: { a: 1 } }]);`],
      [
        'bulk operation pushed onto an operations list',
        `const operations = [];\noperations.push({ updateOne: { filter, update: { $set: { a: 1 } } } });`,
      ],
    ])('accepts a supported $set position: %s', (_shape, source) => {
      expect(findAliasStages(parse('fixture.ts', source))).toEqual([]);
    });

    it('flags a $count accumulator but not the $count stage', () => {
      expect(
        findAccumulatorCounts(
          parse('fixture.ts', `Model.aggregate([{ $group: { _id: null, n: { $count: {} } } }]);`),
        ),
      ).not.toEqual([]);
      expect(
        findAccumulatorCounts(parse('fixture.ts', `Model.aggregate([{ $count: 'total' }]);`)),
      ).toEqual([]);
    });

    it.each([
      ['raw createIndex', `await collection.createIndex({ a: 1 });`],
      ['raw createIndex with options', `await collection.createIndex({ a: 1 }, { unique: true });`],
      ['raw createIndexes', `await Model.createIndexes();`],
      ['raw syncIndexes', `await Model.syncIndexes();`],
    ])('flags an unguarded index build: %s', (_shape, source) => {
      expect(findRawIndexBuilds(parse('fixture.ts', source))).not.toEqual([]);
    });

    it.each([
      [
        'a build wrapped by the helper',
        `await buildIndexWithRetry(() => collection.createIndex({ a: 1 }), 'a_1');`,
      ],
      ['the model helper', `await createIndexesWithRetry(Model);`],
      ['the Meilisearch client', `await client.createIndex('messages', { primaryKey: 'id' });`],
    ])('accepts a guarded index build: %s', (_shape, source) => {
      expect(findRawIndexBuilds(parse('fixture.ts', source))).toEqual([]);
    });
  });
});
