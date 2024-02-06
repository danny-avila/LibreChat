"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const findModuleName = node => {
  if (node.type === _utils.AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node;
  }
  return null;
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Disallow using `jest.mock()` factories without an explicit type parameter',
      recommended: false
    },
    messages: {
      addTypeParameterToModuleMock: 'Add a type parameter to the mock factory such as `typeof import({{ moduleName }})`'
    },
    fixable: 'code',
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const {
          callee,
          typeParameters
        } = node;
        if (callee.type !== _utils.AST_NODE_TYPES.MemberExpression) {
          return;
        }
        const {
          property
        } = callee;
        if (node.arguments.length === 2 && (0, _utils2.isTypeOfJestFnCall)(node, context, ['jest']) && (0, _utils2.isSupportedAccessor)(property) && ['mock', 'doMock'].includes((0, _utils2.getAccessorValue)(property))) {
          const [nameNode, factoryNode] = node.arguments;
          const hasTypeParameter = typeParameters !== undefined && typeParameters.params.length > 0;
          const hasReturnType = (0, _utils2.isFunction)(factoryNode) && factoryNode.returnType !== undefined;
          if (hasTypeParameter || hasReturnType) {
            return;
          }
          const moduleName = findModuleName(nameNode);
          context.report({
            messageId: 'addTypeParameterToModuleMock',
            data: {
              moduleName: (moduleName === null || moduleName === void 0 ? void 0 : moduleName.raw) ?? './module-name'
            },
            node,
            fix(fixer) {
              if (!moduleName) {
                return [];
              }
              return [fixer.insertTextAfter(callee, `<typeof import(${moduleName.raw})>`)];
            }
          });
        }
      }
    };
  }
});