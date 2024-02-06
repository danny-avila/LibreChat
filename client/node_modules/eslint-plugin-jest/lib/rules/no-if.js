"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const testCaseNames = new Set([...Object.keys(_utils2.TestCaseName), 'it.only', 'it.only', 'it.skip', 'it.skip', 'test.only', 'test.only', 'test.skip', 'test.skip', 'fit.concurrent']);
const isTestFunctionExpression = node => node.parent !== undefined && node.parent.type === _utils.AST_NODE_TYPES.CallExpression && testCaseNames.has((0, _utils2.getNodeName)(node.parent.callee));
const conditionName = {
  [_utils.AST_NODE_TYPES.ConditionalExpression]: 'conditional',
  [_utils.AST_NODE_TYPES.SwitchStatement]: 'switch',
  [_utils.AST_NODE_TYPES.IfStatement]: 'if'
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      description: 'Disallow conditional logic',
      category: 'Best Practices',
      recommended: false
    },
    messages: {
      conditionalInTest: 'Test should not contain {{ condition }} statements'
    },
    deprecated: true,
    replacedBy: ['no-conditional-in-test'],
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    const stack = [];
    function validate(node) {
      const lastElementInStack = stack[stack.length - 1];
      if (stack.length === 0 || !lastElementInStack) {
        return;
      }
      context.report({
        data: {
          condition: conditionName[node.type]
        },
        messageId: 'conditionalInTest',
        node
      });
    }
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) === 'test') {
          stack.push(true);
          if (jestFnCall.members.some(s => (0, _utils2.getAccessorValue)(s) === 'each')) {
            stack.push(true);
          }
        }
      },
      FunctionExpression(node) {
        stack.push(isTestFunctionExpression(node));
      },
      FunctionDeclaration(node) {
        const declaredVariables = (0, _utils2.getDeclaredVariables)(context, node);
        const testCallExpressions = (0, _utils2.getTestCallExpressionsFromDeclaredVariables)(declaredVariables, context);
        stack.push(testCallExpressions.length > 0);
      },
      ArrowFunctionExpression(node) {
        stack.push(isTestFunctionExpression(node));
      },
      IfStatement: validate,
      SwitchStatement: validate,
      ConditionalExpression: validate,
      'CallExpression:exit'() {
        stack.pop();
      },
      'FunctionExpression:exit'() {
        stack.pop();
      },
      'FunctionDeclaration:exit'() {
        stack.pop();
      },
      'ArrowFunctionExpression:exit'() {
        stack.pop();
      }
    };
  }
});