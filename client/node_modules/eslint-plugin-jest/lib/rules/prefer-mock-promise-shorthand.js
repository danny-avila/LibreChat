"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const withOnce = (name, addOnce) => {
  return `${name}${addOnce ? 'Once' : ''}`;
};
const findSingleReturnArgumentNode = fnNode => {
  var _fnNode$body$body$;
  if (fnNode.body.type !== _utils.AST_NODE_TYPES.BlockStatement) {
    return fnNode.body;
  }
  if (((_fnNode$body$body$ = fnNode.body.body[0]) === null || _fnNode$body$body$ === void 0 ? void 0 : _fnNode$body$body$.type) === _utils.AST_NODE_TYPES.ReturnStatement) {
    return fnNode.body.body[0].argument;
  }
  return null;
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Prefer mock resolved/rejected shorthands for promises',
      recommended: false
    },
    messages: {
      useMockShorthand: 'Prefer {{ replacement }}'
    },
    schema: [],
    type: 'suggestion',
    fixable: 'code'
  },
  defaultOptions: [],
  create(context) {
    const report = (property, isOnce, outerArgNode, innerArgNode = outerArgNode) => {
      if ((innerArgNode === null || innerArgNode === void 0 ? void 0 : innerArgNode.type) !== _utils.AST_NODE_TYPES.CallExpression) {
        return;
      }
      const argName = (0, _utils2.getNodeName)(innerArgNode);
      if (argName !== 'Promise.resolve' && argName !== 'Promise.reject') {
        return;
      }
      const replacement = withOnce(argName.endsWith('reject') ? 'mockRejectedValue' : 'mockResolvedValue', isOnce);
      context.report({
        node: property,
        messageId: 'useMockShorthand',
        data: {
          replacement
        },
        fix(fixer) {
          const sourceCode = (0, _utils2.getSourceCode)(context);

          // there shouldn't be more than one argument, but if there is don't try
          // fixing since we have no idea what to do with the extra arguments
          if (innerArgNode.arguments.length > 1) {
            return null;
          }
          return [fixer.replaceText(property, replacement), fixer.replaceText(outerArgNode,
          // the value argument for both Promise methods is optional,
          // whereas for Jest they're required so use an explicit undefined
          // if no argument is being passed to the call we're replacing
          innerArgNode.arguments.length === 1 ? sourceCode.getText(innerArgNode.arguments[0]) : 'undefined')];
        }
      });
    };
    return {
      CallExpression(node) {
        if (node.callee.type !== _utils.AST_NODE_TYPES.MemberExpression || !(0, _utils2.isSupportedAccessor)(node.callee.property) || node.arguments.length === 0) {
          return;
        }
        const mockFnName = (0, _utils2.getAccessorValue)(node.callee.property);
        const isOnce = mockFnName.endsWith('Once');
        if (mockFnName === withOnce('mockReturnValue', isOnce)) {
          report(node.callee.property, isOnce, node.arguments[0]);
        } else if (mockFnName === withOnce('mockImplementation', isOnce)) {
          const [arg] = node.arguments;
          if (!(0, _utils2.isFunction)(arg) || arg.params.length !== 0) {
            return;
          }
          report(node.callee.property, isOnce, arg, findSingleReturnArgumentNode(arg));
        }
      }
    };
  }
});