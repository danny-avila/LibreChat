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
      description: 'Disallow duplicate setup and teardown hooks',
      recommended: false
    },
    messages: {
      noDuplicateHook: 'Duplicate {{hook}} in describe block'
    },
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    const hookContexts = [{}];
    return {
      CallExpression(node) {
        var _jestFnCall$name;
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) === 'describe') {
          hookContexts.push({});
        }
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'hook') {
          return;
        }
        const currentLayer = hookContexts[hookContexts.length - 1];
        currentLayer[_jestFnCall$name = jestFnCall.name] || (currentLayer[_jestFnCall$name] = 0);
        currentLayer[jestFnCall.name] += 1;
        if (currentLayer[jestFnCall.name] > 1) {
          context.report({
            messageId: 'noDuplicateHook',
            data: {
              hook: jestFnCall.name
            },
            node
          });
        }
      },
      'CallExpression:exit'(node) {
        if ((0, _utils.isTypeOfJestFnCall)(node, context, ['describe'])) {
          hookContexts.pop();
        }
      }
    };
  }
});