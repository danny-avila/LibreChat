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
      description: 'Suggest using `toBeCalledWith()` or `toHaveBeenCalledWith()`',
      recommended: false
    },
    messages: {
      preferCalledWith: 'Prefer {{ matcherName }}With(/* expected args */)'
    },
    type: 'suggestion',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          return;
        }
        if (jestFnCall.modifiers.some(nod => (0, _utils.getAccessorValue)(nod) === 'not')) {
          return;
        }
        const {
          matcher
        } = jestFnCall;
        const matcherName = (0, _utils.getAccessorValue)(matcher);
        if (['toBeCalled', 'toHaveBeenCalled'].includes(matcherName)) {
          context.report({
            data: {
              matcherName
            },
            messageId: 'preferCalledWith',
            node: matcher
          });
        }
      }
    };
  }
});