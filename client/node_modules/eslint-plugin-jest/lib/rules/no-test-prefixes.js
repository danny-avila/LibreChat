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
      description: 'Require using `.only` and `.skip` over `f` and `x`',
      recommended: 'error'
    },
    messages: {
      usePreferredName: 'Use "{{ preferredNodeName }}" instead'
    },
    fixable: 'code',
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'describe' && (jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'test') {
          return;
        }
        if (jestFnCall.name[0] !== 'f' && jestFnCall.name[0] !== 'x') {
          return;
        }
        const preferredNodeName = [jestFnCall.name.slice(1), jestFnCall.name[0] === 'f' ? 'only' : 'skip', ...jestFnCall.members.map(s => (0, _utils2.getAccessorValue)(s))].join('.');
        const funcNode = node.callee.type === _utils.AST_NODE_TYPES.TaggedTemplateExpression ? node.callee.tag : node.callee.type === _utils.AST_NODE_TYPES.CallExpression ? node.callee.callee : node.callee;
        context.report({
          messageId: 'usePreferredName',
          node: node.callee,
          data: {
            preferredNodeName
          },
          fix(fixer) {
            return [fixer.replaceText(funcNode, preferredNodeName)];
          }
        });
      }
    };
  }
});