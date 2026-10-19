const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');

const requireApi = createRequire(require.resolve('../packages/api/package.json'));
const ts = requireApi('typescript');
const jestMethods = new Set([
  'mock',
  'doMock',
  'unmock',
  'deepUnmock',
  'requireActual',
  'requireMock',
  'createMockFromModule',
]);

module.exports = {
  extract(code, filePath, defaultExtract) {
    const dependencies = new Set(defaultExtract(code, filePath));
    // Jest's default extractor misses calls such as jest.requireActual<typeof Module>('./module').
    if (!/\bjest\s*\./.test(code)) {
      return dependencies;
    }
    const source = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, false);
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        node.typeArguments?.length &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'jest' &&
        jestMethods.has(node.expression.name.text) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        dependencies.add(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return dependencies;
  },
  getCacheKey() {
    return createHash('sha256').update(readFileSync(__filename)).update(ts.version).digest('hex');
  },
};
