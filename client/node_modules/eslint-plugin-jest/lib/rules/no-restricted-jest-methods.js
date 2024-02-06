"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
const messages = {
  restrictedJestMethod: 'Use of `{{ restriction }}` is disallowed',
  restrictedJestMethodWithMessage: '{{ message }}'
};
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Disallow specific `jest.` methods',
      recommended: false
    },
    type: 'suggestion',
    schema: [{
      type: 'object',
      additionalProperties: {
        type: ['string', 'null']
      }
    }],
    messages
  },
  defaultOptions: [{}],
  create(context, [restrictedMethods]) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'jest' || jestFnCall.members.length === 0) {
          return;
        }
        const method = (0, _utils.getAccessorValue)(jestFnCall.members[0]);
        if (method in restrictedMethods) {
          const message = restrictedMethods[method];
          context.report({
            messageId: message ? 'restrictedJestMethodWithMessage' : 'restrictedJestMethod',
            data: {
              message,
              restriction: method
            },
            loc: {
              start: jestFnCall.members[0].loc.start,
              end: jestFnCall.members[jestFnCall.members.length - 1].loc.end
            }
          });
        }
      }
    };
  }
});