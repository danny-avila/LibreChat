"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const isNullLiteral = node => node.type === _utils.AST_NODE_TYPES.Literal && node.value === null;

/**
 * Checks if the given `ParsedEqualityMatcherCall` is a call to one of the equality matchers,
 * with a `null` literal as the sole argument.
 */
const isNullEqualityMatcher = expectFnCall => isNullLiteral((0, _utils2.getFirstMatcherArg)(expectFnCall));
const isFirstArgumentIdentifier = (expectFnCall, name) => (0, _utils2.isIdentifier)((0, _utils2.getFirstMatcherArg)(expectFnCall), name);
const shouldUseToBe = expectFnCall => {
  let firstArg = (0, _utils2.getFirstMatcherArg)(expectFnCall);
  if (firstArg.type === _utils.AST_NODE_TYPES.UnaryExpression && firstArg.operator === '-') {
    firstArg = firstArg.argument;
  }
  if (firstArg.type === _utils.AST_NODE_TYPES.Literal) {
    // regex literals are classed as literals, but they're actually objects
    // which means "toBe" will give different results than other matchers
    return !('regex' in firstArg);
  }
  return firstArg.type === _utils.AST_NODE_TYPES.TemplateLiteral;
};
const reportPreferToBe = (context, whatToBe, expectFnCall, func, modifierNode) => {
  context.report({
    messageId: `useToBe${whatToBe}`,
    fix(fixer) {
      var _expectFnCall$args;
      const fixes = [(0, _utils2.replaceAccessorFixer)(fixer, expectFnCall.matcher, `toBe${whatToBe}`)];
      if ((_expectFnCall$args = expectFnCall.args) !== null && _expectFnCall$args !== void 0 && _expectFnCall$args.length && whatToBe !== '') {
        fixes.push((0, _utils2.removeExtraArgumentsFixer)(fixer, context, func, 0));
      }
      if (modifierNode) {
        fixes.push(fixer.removeRange([modifierNode.range[0] - 1, modifierNode.range[1]]));
      }
      return fixes;
    },
    node: expectFnCall.matcher
  });
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Suggest using `toBe()` for primitive literals',
      recommended: false
    },
    messages: {
      useToBe: 'Use `toBe` when expecting primitive literals',
      useToBeUndefined: 'Use `toBeUndefined` instead',
      useToBeDefined: 'Use `toBeDefined` instead',
      useToBeNull: 'Use `toBeNull` instead',
      useToBeNaN: 'Use `toBeNaN` instead'
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
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          return;
        }
        const matcherName = (0, _utils2.getAccessorValue)(jestFnCall.matcher);
        const notModifier = jestFnCall.modifiers.find(nod => (0, _utils2.getAccessorValue)(nod) === 'not');
        if (notModifier && ['toBeUndefined', 'toBeDefined'].includes(matcherName)) {
          reportPreferToBe(context, matcherName === 'toBeDefined' ? 'Undefined' : 'Defined', jestFnCall, node, notModifier);
          return;
        }
        if (!_utils2.EqualityMatcher.hasOwnProperty(matcherName) || jestFnCall.args.length === 0) {
          return;
        }
        if (isNullEqualityMatcher(jestFnCall)) {
          reportPreferToBe(context, 'Null', jestFnCall, node);
          return;
        }
        if (isFirstArgumentIdentifier(jestFnCall, 'undefined')) {
          const name = notModifier ? 'Defined' : 'Undefined';
          reportPreferToBe(context, name, jestFnCall, node, notModifier);
          return;
        }
        if (isFirstArgumentIdentifier(jestFnCall, 'NaN')) {
          reportPreferToBe(context, 'NaN', jestFnCall, node);
          return;
        }
        if (shouldUseToBe(jestFnCall) && matcherName !== _utils2.EqualityMatcher.toBe) {
          reportPreferToBe(context, '', jestFnCall, node);
        }
      }
    };
  }
});