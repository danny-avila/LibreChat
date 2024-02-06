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
      description: 'Disallow using `exports` in files containing tests',
      recommended: 'error'
    },
    messages: {
      unexpectedExport: `Do not export from a test file`
    },
    type: 'suggestion',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const exportNodes = [];
    let hasTestCase = false;
    return {
      'Program:exit'() {
        if (hasTestCase && exportNodes.length > 0) {
          for (const node of exportNodes) {
            context.report({
              node,
              messageId: 'unexpectedExport'
            });
          }
        }
      },
      CallExpression(node) {
        if ((0, _utils2.isTypeOfJestFnCall)(node, context, ['test'])) {
          hasTestCase = true;
        }
      },
      'ExportNamedDeclaration, ExportDefaultDeclaration'(node) {
        exportNodes.push(node);
      },
      'AssignmentExpression > MemberExpression'(node) {
        let {
          object,
          property
        } = node;
        if (object.type === _utils.AST_NODE_TYPES.MemberExpression) {
          ({
            object,
            property
          } = object);
        }
        if ('name' in object && object.name === 'module' && property.type === _utils.AST_NODE_TYPES.Identifier && /^exports?$/u.test(property.name)) {
          exportNodes.push(node);
        }
      }
    };
  }
});