"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const findNodeObject = node => {
  if ('object' in node) {
    return node.object;
  }
  if (node.callee.type === _utils.AST_NODE_TYPES.MemberExpression) {
    return node.callee.object;
  }
  return null;
};
const getJestFnCall = node => {
  if (node.type !== _utils.AST_NODE_TYPES.CallExpression && node.type !== _utils.AST_NODE_TYPES.MemberExpression) {
    return null;
  }
  const obj = findNodeObject(node);
  if (!obj) {
    return null;
  }
  if (obj.type === _utils.AST_NODE_TYPES.Identifier) {
    return node.type === _utils.AST_NODE_TYPES.CallExpression && (0, _utils2.getNodeName)(node.callee) === 'jest.fn' ? node : null;
  }
  return getJestFnCall(obj);
};
const getAutoFixMockImplementation = (jestFnCall, context) => {
  var _jestFnCall$parent;
  const hasMockImplementationAlready = ((_jestFnCall$parent = jestFnCall.parent) === null || _jestFnCall$parent === void 0 ? void 0 : _jestFnCall$parent.type) === _utils.AST_NODE_TYPES.MemberExpression && jestFnCall.parent.property.type === _utils.AST_NODE_TYPES.Identifier && jestFnCall.parent.property.name === 'mockImplementation';
  if (hasMockImplementationAlready) {
    return '';
  }
  const [arg] = jestFnCall.arguments;
  const argSource = arg && (0, _utils2.getSourceCode)(context).getText(arg);
  return argSource ? `.mockImplementation(${argSource})` : '.mockImplementation()';
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Suggest using `jest.spyOn()`',
      recommended: false
    },
    messages: {
      useJestSpyOn: 'Use jest.spyOn() instead'
    },
    fixable: 'code',
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    return {
      AssignmentExpression(node) {
        const {
          left,
          right
        } = node;
        if (left.type !== _utils.AST_NODE_TYPES.MemberExpression) {
          return;
        }
        const jestFnCall = getJestFnCall(right);
        if (!jestFnCall) {
          return;
        }
        context.report({
          node,
          messageId: 'useJestSpyOn',
          fix(fixer) {
            const leftPropQuote = left.property.type === _utils.AST_NODE_TYPES.Identifier && !left.computed ? "'" : '';
            const mockImplementation = getAutoFixMockImplementation(jestFnCall, context);
            return [fixer.insertTextBefore(left, `jest.spyOn(`), fixer.replaceTextRange([left.object.range[1], left.property.range[0]], `, ${leftPropQuote}`), fixer.replaceTextRange([left.property.range[1], jestFnCall.range[1]], `${leftPropQuote})${mockImplementation}`)];
          }
        });
      }
    };
  }
});