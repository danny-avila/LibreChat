"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const isString = node => {
  return (0, _utils2.isStringNode)(node) || node.type === _utils.AST_NODE_TYPES.TemplateLiteral;
};
const isComparingToString = expression => {
  return isString(expression.left) || isString(expression.right);
};
const invertOperator = operator => {
  switch (operator) {
    case '>':
      return '<=';
    case '<':
      return '>=';
    case '>=':
      return '<';
    case '<=':
      return '>';
  }
  return null;
};
const determineMatcher = (operator, negated) => {
  const op = negated ? invertOperator(operator) : operator;
  switch (op) {
    case '>':
      return 'toBeGreaterThan';
    case '<':
      return 'toBeLessThan';
    case '>=':
      return 'toBeGreaterThanOrEqual';
    case '<=':
      return 'toBeLessThanOrEqual';
  }
  return null;
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Suggest using the built-in comparison matchers',
      recommended: false
    },
    messages: {
      useToBeComparison: 'Prefer using `{{ preferredMatcher }}` instead'
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
          arguments: [comparison],
          range: [, expectCallEnd]
        } = expect;
        const {
          matcher
        } = jestFnCall;
        const matcherArg = (0, _utils2.getFirstMatcherArg)(jestFnCall);
        if ((comparison === null || comparison === void 0 ? void 0 : comparison.type) !== _utils.AST_NODE_TYPES.BinaryExpression || isComparingToString(comparison) || !_utils2.EqualityMatcher.hasOwnProperty((0, _utils2.getAccessorValue)(matcher)) || !(0, _utils2.isBooleanLiteral)(matcherArg)) {
          return;
        }
        const [modifier] = jestFnCall.modifiers;
        const hasNot = jestFnCall.modifiers.some(nod => (0, _utils2.getAccessorValue)(nod) === 'not');
        const preferredMatcher = determineMatcher(comparison.operator, matcherArg.value === hasNot);
        if (!preferredMatcher) {
          return;
        }
        context.report({
          fix(fixer) {
            const sourceCode = (0, _utils2.getSourceCode)(context);

            // preserve the existing modifier if it's not a negation
            const modifierText = modifier && (0, _utils2.getAccessorValue)(modifier) !== 'not' ? `.${(0, _utils2.getAccessorValue)(modifier)}` : '';
            return [
            // replace the comparison argument with the left-hand side of the comparison
            fixer.replaceText(comparison, sourceCode.getText(comparison.left)),
            // replace the current matcher & modifier with the preferred matcher
            fixer.replaceTextRange([expectCallEnd, matcher.parent.range[1]], `${modifierText}.${preferredMatcher}`),
            // replace the matcher argument with the right-hand side of the comparison
            fixer.replaceText(matcherArg, sourceCode.getText(comparison.right))];
          },
          messageId: 'useToBeComparison',
          data: {
            preferredMatcher
          },
          node: matcher
        });
      }
    };
  }
});