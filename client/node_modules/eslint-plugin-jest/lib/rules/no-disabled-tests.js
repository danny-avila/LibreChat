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
      description: 'Disallow disabled tests',
      recommended: 'warn'
    },
    messages: {
      missingFunction: 'Test is missing function argument',
      pending: 'Call to pending()',
      pendingSuite: 'Call to pending() within test suite',
      pendingTest: 'Call to pending() within test',
      disabledSuite: 'Disabled test suite',
      disabledTest: 'Disabled test'
    },
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    let suiteDepth = 0;
    let testDepth = 0;
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if (!jestFnCall) {
          return;
        }
        if (jestFnCall.type === 'describe') {
          suiteDepth++;
        }
        if (jestFnCall.type === 'test') {
          testDepth++;
          if (node.arguments.length < 2 && jestFnCall.members.every(s => (0, _utils.getAccessorValue)(s) !== 'todo')) {
            context.report({
              messageId: 'missingFunction',
              node
            });
          }
        }
        if (
        // the only jest functions that are with "x" are "xdescribe", "xtest", and "xit"
        jestFnCall.name.startsWith('x') || jestFnCall.members.some(s => (0, _utils.getAccessorValue)(s) === 'skip')) {
          context.report({
            messageId: jestFnCall.type === 'describe' ? 'disabledSuite' : 'disabledTest',
            node
          });
        }
      },
      'CallExpression:exit'(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if (!jestFnCall) {
          return;
        }
        if (jestFnCall.type === 'describe') {
          suiteDepth--;
        }
        if (jestFnCall.type === 'test') {
          testDepth--;
        }
      },
      'CallExpression[callee.name="pending"]'(node) {
        if ((0, _utils.resolveScope)((0, _utils.getScope)(context, node), 'pending')) {
          return;
        }
        if (testDepth > 0) {
          context.report({
            messageId: 'pendingTest',
            node
          });
        } else if (suiteDepth > 0) {
          context.report({
            messageId: 'pendingSuite',
            node
          });
        } else {
          context.report({
            messageId: 'pending',
            node
          });
        }
      }
    };
  }
});