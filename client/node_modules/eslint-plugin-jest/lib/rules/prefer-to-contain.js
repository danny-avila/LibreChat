"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
/**
 * Checks if the given `node` is a `CallExpression` representing the calling
 * of an `includes`-like method that can be 'fixed' (using `toContain`).
 *
 * @param {CallExpression} node
 *
 * @return {node is FixableIncludesCallExpression}
 */
const isFixableIncludesCallExpression = node => node.type === _utils.AST_NODE_TYPES.CallExpression && node.callee.type === _utils.AST_NODE_TYPES.MemberExpression && (0, _utils2.isSupportedAccessor)(node.callee.property, 'includes') && (0, _utils2.hasOnlyOneArgument)(node) && node.arguments[0].type !== _utils.AST_NODE_TYPES.SpreadElement;

// expect(array.includes(<value>)[not.]{toBe,toEqual}(<boolean>)
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Suggest using `toContain()`',
      recommended: false
    },
    messages: {
      useToContain: 'Use toContain() instead'
    },
    fixable: 'code',
    type: 'suggestion',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect' || jestFnCall.args.length === 0) {
          return;
        }
        const {
          parent: expect
        } = jestFnCall.head.node;
        if ((expect === null || expect === void 0 ? void 0 : expect.type) !== _utils.AST_NODE_TYPES.CallExpression) {
          return;
        }
        const {
          arguments: [includesCall],
          range: [, expectCallEnd]
        } = expect;
        const {
          matcher
        } = jestFnCall;
        const matcherArg = (0, _utils2.getFirstMatcherArg)(jestFnCall);
        if (!includesCall || matcherArg.type === _utils.AST_NODE_TYPES.SpreadElement || !_utils2.EqualityMatcher.hasOwnProperty((0, _utils2.getAccessorValue)(matcher)) || !(0, _utils2.isBooleanLiteral)(matcherArg) || !isFixableIncludesCallExpression(includesCall)) {
          return;
        }
        const hasNot = jestFnCall.modifiers.some(nod => (0, _utils2.getAccessorValue)(nod) === 'not');
        context.report({
          fix(fixer) {
            const sourceCode = (0, _utils2.getSourceCode)(context);

            // we need to negate the expectation if the current expected
            // value is itself negated by the "not" modifier
            const addNotModifier = matcherArg.value === hasNot;
            return [
            // remove the "includes" call entirely
            fixer.removeRange([includesCall.callee.property.range[0] - 1, includesCall.range[1]]),
            // replace the current matcher with "toContain", adding "not" if needed
            fixer.replaceTextRange([expectCallEnd, matcher.parent.range[1]], addNotModifier ? `.${_utils2.ModifierName.not}.toContain` : '.toContain'),
            // replace the matcher argument with the value from the "includes"
            fixer.replaceText(jestFnCall.args[0], sourceCode.getText(includesCall.arguments[0]))];
          },
          messageId: 'useToContain',
          node: matcher
        });
      }
    };
  }
});