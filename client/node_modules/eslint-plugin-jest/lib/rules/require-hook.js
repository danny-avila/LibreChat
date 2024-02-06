"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const isJestFnCall = (node, context) => {
  var _getNodeName;
  if ((0, _utils2.parseJestFnCall)(node, context)) {
    return true;
  }
  return !!((_getNodeName = (0, _utils2.getNodeName)(node)) !== null && _getNodeName !== void 0 && _getNodeName.startsWith('jest.'));
};
const isNullOrUndefined = node => {
  return node.type === _utils.AST_NODE_TYPES.Literal && node.value === null || (0, _utils2.isIdentifier)(node, 'undefined');
};
const shouldBeInHook = (node, context, allowedFunctionCalls = []) => {
  switch (node.type) {
    case _utils.AST_NODE_TYPES.ExpressionStatement:
      return shouldBeInHook(node.expression, context, allowedFunctionCalls);
    case _utils.AST_NODE_TYPES.CallExpression:
      return !(isJestFnCall(node, context) || allowedFunctionCalls.includes((0, _utils2.getNodeName)(node)));
    case _utils.AST_NODE_TYPES.VariableDeclaration:
      {
        if (node.kind === 'const') {
          return false;
        }
        return node.declarations.some(({
          init
        }) => init !== null && !isNullOrUndefined(init));
      }
    default:
      return false;
  }
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Require setup and teardown code to be within a hook',
      recommended: false
    },
    messages: {
      useHook: 'This should be done within a hook'
    },
    type: 'suggestion',
    schema: [{
      type: 'object',
      properties: {
        allowedFunctionCalls: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      },
      additionalProperties: false
    }]
  },
  defaultOptions: [{
    allowedFunctionCalls: []
  }],
  create(context) {
    const {
      allowedFunctionCalls
    } = context.options[0] ?? {};
    const checkBlockBody = body => {
      for (const statement of body) {
        if (shouldBeInHook(statement, context, allowedFunctionCalls)) {
          context.report({
            node: statement,
            messageId: 'useHook'
          });
        }
      }
    };
    return {
      Program(program) {
        checkBlockBody(program.body);
      },
      CallExpression(node) {
        if (!(0, _utils2.isTypeOfJestFnCall)(node, context, ['describe']) || node.arguments.length < 2) {
          return;
        }
        const [, testFn] = node.arguments;
        if (!(0, _utils2.isFunction)(testFn) || testFn.body.type !== _utils.AST_NODE_TYPES.BlockStatement) {
          return;
        }
        checkBlockBody(testFn.body.body);
      }
    };
  }
});