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
      description: 'Enforces a maximum depth to nested describe calls',
      recommended: false
    },
    messages: {
      exceededMaxDepth: 'Too many nested describe calls ({{ depth }}) - maximum allowed is {{ max }}'
    },
    type: 'suggestion',
    schema: [{
      type: 'object',
      properties: {
        max: {
          type: 'integer',
          minimum: 0
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
    const describes = [];
    return {
      CallExpression(node) {
        if ((0, _utils.isTypeOfJestFnCall)(node, context, ['describe'])) {
          describes.unshift(node);
          if (describes.length > max) {
            context.report({
              node,
              messageId: 'exceededMaxDepth',
              data: {
                depth: describes.length,
                max
              }
            });
          }
        }
      },
      'CallExpression:exit'(node) {
        if (describes[0] === node) {
          describes.shift();
        }
      }
    };
  }
});