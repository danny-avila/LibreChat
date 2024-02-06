"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
function isEmptyFunction(node) {
  if (!(0, _utils2.isFunction)(node)) {
    return false;
  }
  return node.body.type === _utils.AST_NODE_TYPES.BlockStatement && !node.body.body.length;
}
function createTodoFixer(jestFnCall, fixer) {
  if (jestFnCall.members.length) {
    return (0, _utils2.replaceAccessorFixer)(fixer, jestFnCall.members[0], 'todo');
  }
  return fixer.replaceText(jestFnCall.head.node, `${jestFnCall.head.local}.todo`);
}
const isTargetedTestCase = jestFnCall => {
  if (jestFnCall.members.some(s => (0, _utils2.getAccessorValue)(s) !== 'skip')) {
    return false;
  }

  // todo: we should support this too (needs custom fixer)
  if (jestFnCall.name.startsWith('x')) {
    return false;
  }
  return !jestFnCall.name.startsWith('f');
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Suggest using `test.todo`',
      recommended: false
    },
    messages: {
      emptyTest: 'Prefer todo test case over empty test case',
      unimplementedTest: 'Prefer todo test case over unimplemented test case'
    },
    fixable: 'code',
    schema: [],
    type: 'layout'
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const [title, callback] = node.arguments;
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if (!title || (jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'test' || !isTargetedTestCase(jestFnCall) || !(0, _utils2.isStringNode)(title)) {
          return;
        }
        if (callback && isEmptyFunction(callback)) {
          context.report({
            messageId: 'emptyTest',
            node,
            fix: fixer => [fixer.removeRange([title.range[1], callback.range[1]]), createTodoFixer(jestFnCall, fixer)]
          });
        }
        if ((0, _utils2.hasOnlyOneArgument)(node)) {
          context.report({
            messageId: 'unimplementedTest',
            node,
            fix: fixer => createTodoFixer(jestFnCall, fixer)
          });
        }
      }
    };
  }
});