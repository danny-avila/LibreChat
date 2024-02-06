"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const getBody = args => {
  const [, secondArg] = args;
  if (secondArg && (0, _utils2.isFunction)(secondArg) && secondArg.body.type === _utils.AST_NODE_TYPES.BlockStatement) {
    return secondArg.body.body;
  }
  return [];
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Disallow explicitly returning from tests',
      recommended: false
    },
    messages: {
      noReturnValue: 'Jest tests should not return a value'
    },
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!(0, _utils2.isTypeOfJestFnCall)(node, context, ['test'])) {
          return;
        }
        const body = getBody(node.arguments);
        const returnStmt = body.find(t => t.type === _utils.AST_NODE_TYPES.ReturnStatement);
        if (!returnStmt) {
          return;
        }
        context.report({
          messageId: 'noReturnValue',
          node: returnStmt
        });
      },
      FunctionDeclaration(node) {
        const declaredVariables = (0, _utils2.getDeclaredVariables)(context, node);
        const testCallExpressions = (0, _utils2.getTestCallExpressionsFromDeclaredVariables)(declaredVariables, context);
        if (testCallExpressions.length === 0) {
          return;
        }
        const returnStmt = node.body.body.find(t => t.type === _utils.AST_NODE_TYPES.ReturnStatement);
        if (!returnStmt) {
          return;
        }
        context.report({
          messageId: 'noReturnValue',
          node: returnStmt
        });
      }
    };
  }
});