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
      description: 'Suggest using `toHaveLength()`',
      recommended: false
    },
    messages: {
      useToHaveLength: 'Use toHaveLength() instead'
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
        const {
          parent: expect
        } = jestFnCall.head.node;
        if ((expect === null || expect === void 0 ? void 0 : expect.type) !== _utils.AST_NODE_TYPES.CallExpression) {
          return;
        }
        const [argument] = expect.arguments;
        const {
          matcher
        } = jestFnCall;
        if (!_utils2.EqualityMatcher.hasOwnProperty((0, _utils2.getAccessorValue)(matcher)) || (argument === null || argument === void 0 ? void 0 : argument.type) !== _utils.AST_NODE_TYPES.MemberExpression || !(0, _utils2.isSupportedAccessor)(argument.property, 'length')) {
          return;
        }
        context.report({
          fix(fixer) {
            return [
            // remove the "length" property accessor
            fixer.removeRange([argument.property.range[0] - 1, argument.range[1]]),
            // replace the current matcher with "toHaveLength"
            fixer.replaceTextRange([matcher.parent.object.range[1], matcher.parent.range[1]], '.toHaveLength')];
          },
          messageId: 'useToHaveLength',
          node: matcher
        });
      }
    };
  }
});