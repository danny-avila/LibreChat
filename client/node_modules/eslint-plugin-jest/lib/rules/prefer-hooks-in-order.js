"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
const HooksOrder = ['beforeAll', 'beforeEach', 'afterEach', 'afterAll'];
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Prefer having hooks in a consistent order',
      recommended: false
    },
    messages: {
      reorderHooks: `\`{{ currentHook }}\` hooks should be before any \`{{ previousHook }}\` hooks`
    },
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    let previousHookIndex = -1;
    let inHook = false;
    return {
      CallExpression(node) {
        if (inHook) {
          // Ignore everything that is passed into a hook
          return;
        }
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'hook') {
          // Reset the previousHookIndex when encountering something different from a hook
          previousHookIndex = -1;
          return;
        }
        inHook = true;
        const currentHook = jestFnCall.name;
        const currentHookIndex = HooksOrder.indexOf(currentHook);
        if (currentHookIndex < previousHookIndex) {
          context.report({
            messageId: 'reorderHooks',
            node,
            data: {
              previousHook: HooksOrder[previousHookIndex],
              currentHook
            }
          });
          return;
        }
        previousHookIndex = currentHookIndex;
      },
      'CallExpression:exit'(node) {
        if ((0, _utils.isTypeOfJestFnCall)(node, context, ['hook'])) {
          inHook = false;
          return;
        }
        if (inHook) {
          return;
        }

        // Reset the previousHookIndex when encountering something different from a hook
        previousHookIndex = -1;
      }
    };
  }
});