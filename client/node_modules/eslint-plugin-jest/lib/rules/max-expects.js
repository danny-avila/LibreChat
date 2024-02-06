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
      description: 'Enforces a maximum number assertion calls in a test body',
      recommended: false
    },
    messages: {
      exceededMaxAssertion: 'Too many assertion calls ({{ count }}) - maximum allowed is {{ max }}'
    },
    type: 'suggestion',
    schema: [{
      type: 'object',
      properties: {
        max: {
          type: 'integer',
          minimum: 1
        }
      },
      additionalProperties: false
    }]
  },
  defaultOptions: [{
    max: 5
  }],
  create(context, [{
    max
  }]) {
    let count = 0;
    const maybeResetCount = node => {
      var _node$parent;
      const isTestFn = ((_node$parent = node.parent) === null || _node$parent === void 0 ? void 0 : _node$parent.type) !== _utils.AST_NODE_TYPES.CallExpression || (0, _utils2.isTypeOfJestFnCall)(node.parent, context, ['test']);
      if (isTestFn) {
        count = 0;
      }
    };
    return {
      FunctionExpression: maybeResetCount,
      'FunctionExpression:exit': maybeResetCount,
      ArrowFunctionExpression: maybeResetCount,
      'ArrowFunctionExpression:exit': maybeResetCount,
      CallExpression(node) {
        var _jestFnCall$head$node;
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect' || ((_jestFnCall$head$node = jestFnCall.head.node.parent) === null || _jestFnCall$head$node === void 0 ? void 0 : _jestFnCall$head$node.type) === _utils.AST_NODE_TYPES.MemberExpression) {
          return;
        }
        count += 1;
        if (count > max) {
          context.report({
            node,
            messageId: 'exceededMaxAssertion',
            data: {
              count,
              max
            }
          });
        }
      }
    };
  }
});