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
      description: 'Disallow string interpolation inside snapshots',
      recommended: 'error'
    },
    messages: {
      noInterpolation: 'Do not use string interpolation inside of snapshots'
    },
    schema: [],
    type: 'problem'
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          return;
        }
        if (['toMatchInlineSnapshot', 'toThrowErrorMatchingInlineSnapshot'].includes((0, _utils2.getAccessorValue)(jestFnCall.matcher))) {
          // Check all since the optional 'propertyMatchers' argument might be present
          jestFnCall.args.forEach(argument => {
            if (argument.type === _utils.AST_NODE_TYPES.TemplateLiteral && argument.expressions.length > 0) {
              context.report({
                messageId: 'noInterpolation',
                node: argument
              });
            }
          });
        }
      }
    };
  }
});