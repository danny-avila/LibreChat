"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
const newDescribeContext = () => ({
  describeTitles: [],
  testTitles: []
});
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Disallow identical titles',
      recommended: 'error'
    },
    messages: {
      multipleTestTitle: 'Test title is used multiple times in the same describe block',
      multipleDescribeTitle: 'Describe block title is used multiple times in the same describe block'
    },
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    const contexts = [newDescribeContext()];
    return {
      CallExpression(node) {
        const currentLayer = contexts[contexts.length - 1];
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if (!jestFnCall) {
          return;
        }
        if (jestFnCall.type === 'describe') {
          contexts.push(newDescribeContext());
        }
        if (jestFnCall.members.find(s => (0, _utils.isSupportedAccessor)(s, 'each'))) {
          return;
        }
        const [argument] = node.arguments;
        if (!argument || !(0, _utils.isStringNode)(argument)) {
          return;
        }
        const title = (0, _utils.getStringValue)(argument);
        if (jestFnCall.type === 'test') {
          if (currentLayer.testTitles.includes(title)) {
            context.report({
              messageId: 'multipleTestTitle',
              node: argument
            });
          }
          currentLayer.testTitles.push(title);
        }
        if (jestFnCall.type !== 'describe') {
          return;
        }
        if (currentLayer.describeTitles.includes(title)) {
          context.report({
            messageId: 'multipleDescribeTitle',
            node: argument
          });
        }
        currentLayer.describeTitles.push(title);
      },
      'CallExpression:exit'(node) {
        if ((0, _utils.isTypeOfJestFnCall)(node, context, ['describe'])) {
          contexts.pop();
        }
      }
    };
  }
});