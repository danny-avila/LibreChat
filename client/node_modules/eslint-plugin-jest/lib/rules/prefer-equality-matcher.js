"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Suggest using the built-in equality matchers',
      recommended: false
    },
    messages: {
      useEqualityMatcher: 'Prefer using one of the equality matchers instead',
      suggestEqualityMatcher: 'Use `{{ equalityMatcher }}`'
    },
    hasSuggestions: true,
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
        if ((comparison === null || comparison === void 0 ? void 0 : comparison.type) !== _utils.AST_NODE_TYPES.BinaryExpression || comparison.operator !== '===' && comparison.operator !== '!==' || !_utils2.EqualityMatcher.hasOwnProperty((0, _utils2.getAccessorValue)(matcher)) || !(0, _utils2.isBooleanLiteral)(matcherArg)) {
          return;
        }
        const matcherValue = matcherArg.value;
        const [modifier] = jestFnCall.modifiers;
        const hasNot = jestFnCall.modifiers.some(nod => (0, _utils2.getAccessorValue)(nod) === 'not');

        // we need to negate the expectation if the current expected
        // value is itself negated by the "not" modifier
        const addNotModifier = (comparison.operator === '!==' ? !matcherValue : matcherValue) === hasNot;
        const buildFixer = equalityMatcher => fixer => {
          const sourceCode = (0, _utils2.getSourceCode)(context);

          // preserve the existing modifier if it's not a negation
          let modifierText = modifier && (0, _utils2.getAccessorValue)(modifier) !== 'not' ? `.${(0, _utils2.getAccessorValue)(modifier)}` : '';
          if (addNotModifier) {
            modifierText += `.${_utils2.ModifierName.not}`;
          }
          return [
          // replace the comparison argument with the left-hand side of the comparison
          fixer.replaceText(comparison, sourceCode.getText(comparison.left)),
          // replace the current matcher & modifier with the preferred matcher
          fixer.replaceTextRange([expectCallEnd, matcher.parent.range[1]], `${modifierText}.${equalityMatcher}`),
          // replace the matcher argument with the right-hand side of the comparison
          fixer.replaceText(matcherArg, sourceCode.getText(comparison.right))];
        };
        context.report({
          messageId: 'useEqualityMatcher',
          suggest: ['toBe', 'toEqual', 'toStrictEqual'].map(equalityMatcher => ({
            messageId: 'suggestEqualityMatcher',
            data: {
              equalityMatcher
            },
            fix: buildFixer(equalityMatcher)
          })),
          node: matcher
        });
      }
    };
  }
});