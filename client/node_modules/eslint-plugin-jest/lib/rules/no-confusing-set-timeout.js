"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
function isJestSetTimeout(jestFnCall) {
  return jestFnCall.type === 'jest' && jestFnCall.members.length === 1 && (0, _utils.isIdentifier)(jestFnCall.members[0], 'setTimeout');
}
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Disallow confusing usages of jest.setTimeout',
      recommended: false
    },
    messages: {
      globalSetTimeout: '`jest.setTimeout` should be call in `global` scope',
      multipleSetTimeouts: 'Do not call `jest.setTimeout` multiple times, as only the last call will have an effect',
      orderSetTimeout: '`jest.setTimeout` should be placed before any other jest methods'
    },
    type: 'problem',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    let seenJestTimeout = false;
    let shouldEmitOrderSetTimeout = false;
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if (!jestFnCall) {
          return;
        }
        if (!isJestSetTimeout(jestFnCall)) {
          shouldEmitOrderSetTimeout = true;
          return;
        }
        if (!['global', 'module'].includes((0, _utils.getScope)(context, node).type)) {
          context.report({
            messageId: 'globalSetTimeout',
            node
          });
        }
        if (shouldEmitOrderSetTimeout) {
          context.report({
            messageId: 'orderSetTimeout',
            node
          });
        }
        if (seenJestTimeout) {
          context.report({
            messageId: 'multipleSetTimeouts',
            node
          });
        }
        seenJestTimeout = true;
      }
    };
  }
});