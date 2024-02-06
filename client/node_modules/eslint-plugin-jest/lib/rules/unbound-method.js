"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const toThrowMatchers = ['toThrow', 'toThrowError', 'toThrowErrorMatchingSnapshot', 'toThrowErrorMatchingInlineSnapshot'];
const baseRule = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TSESLintPlugin = require('@typescript-eslint/eslint-plugin');
    return TSESLintPlugin.rules['unbound-method'];
  } catch (e) {
    const error = e;
    if (error.code === 'MODULE_NOT_FOUND') {
      return null;
    }
    throw error;
  }
})();
const DEFAULT_MESSAGE = 'This rule requires `@typescript-eslint/eslint-plugin`';
var _default = exports.default = (0, _utils2.createRule)({
  defaultOptions: [{
    ignoreStatic: false
  }],
  ...baseRule,
  name: __filename,
  meta: {
    messages: {
      unbound: DEFAULT_MESSAGE,
      unboundWithoutThisAnnotation: DEFAULT_MESSAGE
    },
    schema: [],
    type: 'problem',
    ...(baseRule === null || baseRule === void 0 ? void 0 : baseRule.meta),
    docs: {
      category: 'Best Practices',
      description: 'Enforce unbound methods are called with their expected scope',
      requiresTypeChecking: true,
      ...(baseRule === null || baseRule === void 0 ? void 0 : baseRule.meta.docs),
      recommended: false
    }
  },
  create(context) {
    const baseSelectors = baseRule === null || baseRule === void 0 ? void 0 : baseRule.create(context);
    if (!baseSelectors) {
      return {};
    }
    return {
      ...baseSelectors,
      MemberExpression(node) {
        var _node$parent, _baseSelectors$Member;
        if (((_node$parent = node.parent) === null || _node$parent === void 0 ? void 0 : _node$parent.type) === _utils.AST_NODE_TYPES.CallExpression) {
          const jestFnCall = (0, _utils2.parseJestFnCall)((0, _utils2.findTopMostCallExpression)(node.parent), context);
          if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) === 'expect') {
            const {
              matcher
            } = jestFnCall;
            if (!toThrowMatchers.includes((0, _utils2.getAccessorValue)(matcher))) {
              return;
            }
          }
        }
        (_baseSelectors$Member = baseSelectors.MemberExpression) === null || _baseSelectors$Member === void 0 || _baseSelectors$Member.call(baseSelectors, node);
      }
    };
  }
});