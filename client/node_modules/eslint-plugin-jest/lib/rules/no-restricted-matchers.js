"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
const isChainRestricted = (chain, restriction) => {
  if (_utils.ModifierName.hasOwnProperty(restriction) || restriction.endsWith('.not')) {
    return chain.startsWith(restriction);
  }
  return chain === restriction;
};
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Disallow specific matchers & modifiers',
      recommended: false
    },
    type: 'suggestion',
    schema: [{
      type: 'object',
      additionalProperties: {
        type: ['string', 'null']
      }
    }],
    messages: {
      restrictedChain: 'Use of `{{ restriction }}` is disallowed',
      restrictedChainWithMessage: '{{ message }}'
    }
  },
  defaultOptions: [{}],
  create(context, [restrictedChains]) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          return;
        }
        const chain = jestFnCall.members.map(nod => (0, _utils.getAccessorValue)(nod)).join('.');
        for (const [restriction, message] of Object.entries(restrictedChains)) {
          if (isChainRestricted(chain, restriction)) {
            context.report({
              messageId: message ? 'restrictedChainWithMessage' : 'restrictedChain',
              data: {
                message,
                restriction
              },
              loc: {
                start: jestFnCall.members[0].loc.start,
                end: jestFnCall.members[jestFnCall.members.length - 1].loc.end
              }
            });
            break;
          }
        }
      }
    };
  }
});