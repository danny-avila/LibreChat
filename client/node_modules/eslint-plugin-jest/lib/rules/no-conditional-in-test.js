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
      description: 'Disallow conditional logic in tests',
      category: 'Best Practices',
      recommended: false
    },
    messages: {
      conditionalInTest: 'Avoid having conditionals in tests'
    },
    type: 'problem',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    let inTestCase = false;
    const maybeReportConditional = node => {
      if (inTestCase) {
        context.report({
          messageId: 'conditionalInTest',
          node
        });
      }
    };
    return {
      CallExpression(node) {
        if ((0, _utils.isTypeOfJestFnCall)(node, context, ['test'])) {
          inTestCase = true;
        }
      },
      'CallExpression:exit'(node) {
        if ((0, _utils.isTypeOfJestFnCall)(node, context, ['test'])) {
          inTestCase = false;
        }
      },
      IfStatement: maybeReportConditional,
      SwitchStatement: maybeReportConditional,
      ConditionalExpression: maybeReportConditional,
      LogicalExpression: maybeReportConditional
    };
  }
});