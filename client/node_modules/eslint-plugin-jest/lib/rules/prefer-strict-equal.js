"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Suggest using `toStrictEqual()`',
      recommended: false
    },
    messages: {
      useToStrictEqual: 'Use `toStrictEqual()` instead',
      suggestReplaceWithStrictEqual: 'Replace with `toStrictEqual()`'
    },
    type: 'suggestion',
    schema: [],
    hasSuggestions: true
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          return;
        }
        const {
          matcher
        } = jestFnCall;
        if ((0, _utils.isSupportedAccessor)(matcher, 'toEqual')) {
          context.report({
            messageId: 'useToStrictEqual',
            node: matcher,
            suggest: [{
              messageId: 'suggestReplaceWithStrictEqual',
              fix: fixer => [(0, _utils.replaceAccessorFixer)(fixer, matcher, _utils.EqualityMatcher.toStrictEqual)]
            }]
          });
        }
      }
    };
  }
});