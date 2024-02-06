"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
const messages = {
  tooManyDescribes: 'There should not be more than {{ max }} describe{{ s }} at the top level',
  unexpectedTestCase: 'All test cases must be wrapped in a describe block.',
  unexpectedHook: 'All hooks must be wrapped in a describe block.'
};
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Require test cases and hooks to be inside a `describe` block',
      recommended: false
    },
    messages,
    type: 'suggestion',
    schema: [{
      type: 'object',
      properties: {
        maxNumberOfTopLevelDescribes: {
          type: 'number',
          minimum: 1
        }
      },
      additionalProperties: false
    }]
  },
  defaultOptions: [{}],
  create(context) {
    const {
      maxNumberOfTopLevelDescribes = Infinity
    } = context.options[0] ?? {};
    let numberOfTopLevelDescribeBlocks = 0;
    let numberOfDescribeBlocks = 0;
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if (!jestFnCall) {
          return;
        }
        if (jestFnCall.type === 'describe') {
          numberOfDescribeBlocks++;
          if (numberOfDescribeBlocks === 1) {
            numberOfTopLevelDescribeBlocks++;
            if (numberOfTopLevelDescribeBlocks > maxNumberOfTopLevelDescribes) {
              context.report({
                node,
                messageId: 'tooManyDescribes',
                data: {
                  max: maxNumberOfTopLevelDescribes,
                  s: maxNumberOfTopLevelDescribes === 1 ? '' : 's'
                }
              });
            }
          }
          return;
        }
        if (numberOfDescribeBlocks === 0) {
          if (jestFnCall.type === 'test') {
            context.report({
              node,
              messageId: 'unexpectedTestCase'
            });
            return;
          }
          if (jestFnCall.type === 'hook') {
            context.report({
              node,
              messageId: 'unexpectedHook'
            });
            return;
          }
        }
      },
      'CallExpression:exit'(node) {
        if ((0, _utils.isTypeOfJestFnCall)(node, context, ['describe'])) {
          numberOfDescribeBlocks--;
        }
      }
    };
  }
});