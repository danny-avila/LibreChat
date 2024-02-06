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
      description: 'Disallow focused tests',
      recommended: 'error'
    },
    messages: {
      focusedTest: 'Unexpected focused test',
      suggestRemoveFocus: 'Remove focus from test'
    },
    schema: [],
    type: 'suggestion',
    hasSuggestions: true
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'test' && (jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'describe') {
          return;
        }
        if (jestFnCall.name.startsWith('f')) {
          context.report({
            messageId: 'focusedTest',
            node: jestFnCall.head.node,
            suggest: [{
              messageId: 'suggestRemoveFocus',
              fix(fixer) {
                // don't apply the fixer if we're an aliased import
                if (jestFnCall.head.type === 'import' && jestFnCall.name !== jestFnCall.head.local) {
                  return null;
                }
                return fixer.removeRange([node.range[0], node.range[0] + 1]);
              }
            }]
          });
          return;
        }
        const onlyNode = jestFnCall.members.find(s => (0, _utils2.getAccessorValue)(s) === 'only');
        if (!onlyNode) {
          return;
        }
        context.report({
          messageId: 'focusedTest',
          node: onlyNode,
          suggest: [{
            messageId: 'suggestRemoveFocus',
            fix: fixer => fixer.removeRange([onlyNode.range[0] - 1, onlyNode.range[1] + Number(onlyNode.type !== _utils.AST_NODE_TYPES.Identifier)])
          }]
        });
      }
    };
  }
});