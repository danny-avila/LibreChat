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
      description: 'Disallow alias methods',
      recommended: 'error'
    },
    messages: {
      replaceAlias: `Replace {{ alias }}() with its canonical name of {{ canonical }}()`
    },
    fixable: 'code',
    type: 'suggestion',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    // map of jest matcher aliases & their canonical names
    const methodNames = {
      toBeCalled: 'toHaveBeenCalled',
      toBeCalledTimes: 'toHaveBeenCalledTimes',
      toBeCalledWith: 'toHaveBeenCalledWith',
      lastCalledWith: 'toHaveBeenLastCalledWith',
      nthCalledWith: 'toHaveBeenNthCalledWith',
      toReturn: 'toHaveReturned',
      toReturnTimes: 'toHaveReturnedTimes',
      toReturnWith: 'toHaveReturnedWith',
      lastReturnedWith: 'toHaveLastReturnedWith',
      nthReturnedWith: 'toHaveNthReturnedWith',
      toThrowError: 'toThrow'
    };
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          return;
        }
        const {
          matcher
        } = jestFnCall;
        const alias = (0, _utils.getAccessorValue)(matcher);
        if (alias in methodNames) {
          const canonical = methodNames[alias];
          context.report({
            messageId: 'replaceAlias',
            data: {
              alias,
              canonical
            },
            node: matcher,
            fix: fixer => [(0, _utils.replaceAccessorFixer)(fixer, matcher, canonical)]
          });
        }
      }
    };
  }
});