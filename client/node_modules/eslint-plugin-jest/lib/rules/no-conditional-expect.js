"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const isCatchCall = node => node.callee.type === _utils.AST_NODE_TYPES.MemberExpression && (0, _utils2.isSupportedAccessor)(node.callee.property, 'catch');
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      description: 'Disallow calling `expect` conditionally',
      category: 'Best Practices',
      recommended: 'error'
    },
    messages: {
      conditionalExpect: 'Avoid calling `expect` conditionally`'
    },
    type: 'problem',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    let conditionalDepth = 0;
    let inTestCase = false;
    let inPromiseCatch = false;
    const increaseConditionalDepth = () => inTestCase && conditionalDepth++;
    const decreaseConditionalDepth = () => inTestCase && conditionalDepth--;
    return {
      FunctionDeclaration(node) {
        const declaredVariables = (0, _utils2.getDeclaredVariables)(context, node);
        const testCallExpressions = (0, _utils2.getTestCallExpressionsFromDeclaredVariables)(declaredVariables, context);
        if (testCallExpressions.length > 0) {
          inTestCase = true;
        }
      },
      CallExpression(node) {
        const {
          type: jestFnCallType
        } = (0, _utils2.parseJestFnCall)(node, context) ?? {};
        if (jestFnCallType === 'test') {
          inTestCase = true;
        }
        if (isCatchCall(node)) {
          inPromiseCatch = true;
        }
        if (inTestCase && jestFnCallType === 'expect' && conditionalDepth > 0) {
          context.report({
            messageId: 'conditionalExpect',
            node
          });
        }
        if (inPromiseCatch && jestFnCallType === 'expect') {
          context.report({
            messageId: 'conditionalExpect',
            node
          });
        }
      },
      'CallExpression:exit'(node) {
        if ((0, _utils2.isTypeOfJestFnCall)(node, context, ['test'])) {
          inTestCase = false;
        }
        if (isCatchCall(node)) {
          inPromiseCatch = false;
        }
      },
      CatchClause: increaseConditionalDepth,
      'CatchClause:exit': decreaseConditionalDepth,
      IfStatement: increaseConditionalDepth,
      'IfStatement:exit': decreaseConditionalDepth,
      SwitchStatement: increaseConditionalDepth,
      'SwitchStatement:exit': decreaseConditionalDepth,
      ConditionalExpression: increaseConditionalDepth,
      'ConditionalExpression:exit': decreaseConditionalDepth,
      LogicalExpression: increaseConditionalDepth,
      'LogicalExpression:exit': decreaseConditionalDepth
    };
  }
});