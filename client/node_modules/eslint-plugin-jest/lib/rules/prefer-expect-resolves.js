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
      description: 'Prefer `await expect(...).resolves` over `expect(await ...)` syntax',
      recommended: false
    },
    fixable: 'code',
    messages: {
      expectResolves: 'Use `await expect(...).resolves instead'
    },
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create: context => ({
    CallExpression(node) {
      const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
      if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
        return;
      }
      const {
        parent
      } = jestFnCall.head.node;
      if ((parent === null || parent === void 0 ? void 0 : parent.type) !== _utils.AST_NODE_TYPES.CallExpression) {
        return;
      }
      const [awaitNode] = parent.arguments;
      if ((awaitNode === null || awaitNode === void 0 ? void 0 : awaitNode.type) === _utils.AST_NODE_TYPES.AwaitExpression) {
        context.report({
          node: awaitNode,
          messageId: 'expectResolves',
          fix(fixer) {
            return [fixer.insertTextBefore(parent, 'await '), fixer.removeRange([awaitNode.range[0], awaitNode.argument.range[0]]), fixer.insertTextAfter(parent, '.resolves')];
          }
        });
      }
    }
  })
});