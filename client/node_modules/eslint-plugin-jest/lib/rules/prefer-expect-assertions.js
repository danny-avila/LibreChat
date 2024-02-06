"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const isFirstStatement = node => {
  let parent = node;
  while (parent) {
    var _parent$parent, _parent$parent2;
    if (((_parent$parent = parent.parent) === null || _parent$parent === void 0 ? void 0 : _parent$parent.type) === _utils.AST_NODE_TYPES.BlockStatement) {
      return parent.parent.body[0] === parent;
    }

    // if we've hit an arrow function, then it must have a single expression
    // as its body, as otherwise we would have hit the block statement already
    if (((_parent$parent2 = parent.parent) === null || _parent$parent2 === void 0 ? void 0 : _parent$parent2.type) === _utils.AST_NODE_TYPES.ArrowFunctionExpression) {
      return true;
    }
    parent = parent.parent;
  }

  /* istanbul ignore next */
  throw new Error(`Could not find BlockStatement - please file a github issue at https://github.com/jest-community/eslint-plugin-jest`);
};
const suggestRemovingExtraArguments = (context, func, from) => ({
  messageId: 'suggestRemovingExtraArguments',
  fix: fixer => (0, _utils2.removeExtraArgumentsFixer)(fixer, context, func, from)
});
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Suggest using `expect.assertions()` OR `expect.hasAssertions()`',
      recommended: false
    },
    messages: {
      hasAssertionsTakesNoArguments: '`expect.hasAssertions` expects no arguments',
      assertionsRequiresOneArgument: '`expect.assertions` excepts a single argument of type number',
      assertionsRequiresNumberArgument: 'This argument should be a number',
      haveExpectAssertions: 'Every test should have either `expect.assertions(<number of assertions>)` or `expect.hasAssertions()` as its first expression',
      suggestAddingHasAssertions: 'Add `expect.hasAssertions()`',
      suggestAddingAssertions: 'Add `expect.assertions(<number of assertions>)`',
      suggestRemovingExtraArguments: 'Remove extra arguments'
    },
    type: 'suggestion',
    hasSuggestions: true,
    schema: [{
      type: 'object',
      properties: {
        onlyFunctionsWithAsyncKeyword: {
          type: 'boolean'
        },
        onlyFunctionsWithExpectInLoop: {
          type: 'boolean'
        },
        onlyFunctionsWithExpectInCallback: {
          type: 'boolean'
        }
      },
      additionalProperties: false
    }]
  },
  defaultOptions: [{
    onlyFunctionsWithAsyncKeyword: false,
    onlyFunctionsWithExpectInLoop: false,
    onlyFunctionsWithExpectInCallback: false
  }],
  create(context, [options]) {
    let expressionDepth = 0;
    let hasExpectInCallback = false;
    let hasExpectInLoop = false;
    let hasExpectAssertionsAsFirstStatement = false;
    let inTestCaseCall = false;
    let inForLoop = false;
    const shouldCheckFunction = testFunction => {
      if (!options.onlyFunctionsWithAsyncKeyword && !options.onlyFunctionsWithExpectInLoop && !options.onlyFunctionsWithExpectInCallback) {
        return true;
      }
      if (options.onlyFunctionsWithAsyncKeyword) {
        if (testFunction.async) {
          return true;
        }
      }
      if (options.onlyFunctionsWithExpectInLoop) {
        if (hasExpectInLoop) {
          return true;
        }
      }
      if (options.onlyFunctionsWithExpectInCallback) {
        if (hasExpectInCallback) {
          return true;
        }
      }
      return false;
    };
    const checkExpectHasAssertions = (expectFnCall, func) => {
      if ((0, _utils2.getAccessorValue)(expectFnCall.members[0]) === 'hasAssertions') {
        if (expectFnCall.args.length) {
          context.report({
            messageId: 'hasAssertionsTakesNoArguments',
            node: expectFnCall.matcher,
            suggest: [suggestRemovingExtraArguments(context, func, 0)]
          });
        }
        return;
      }
      if (expectFnCall.args.length !== 1) {
        let {
          loc
        } = expectFnCall.matcher;
        const suggest = [];
        if (expectFnCall.args.length) {
          loc = expectFnCall.args[1].loc;
          suggest.push(suggestRemovingExtraArguments(context, func, 1));
        }
        context.report({
          messageId: 'assertionsRequiresOneArgument',
          suggest,
          loc
        });
        return;
      }
      const [arg] = expectFnCall.args;
      if (arg.type === _utils.AST_NODE_TYPES.Literal && typeof arg.value === 'number' && Number.isInteger(arg.value)) {
        return;
      }
      context.report({
        messageId: 'assertionsRequiresNumberArgument',
        node: arg
      });
    };
    const enterExpression = () => inTestCaseCall && expressionDepth++;
    const exitExpression = () => inTestCaseCall && expressionDepth--;
    const enterForLoop = () => inForLoop = true;
    const exitForLoop = () => inForLoop = false;
    return {
      FunctionExpression: enterExpression,
      'FunctionExpression:exit': exitExpression,
      ArrowFunctionExpression: enterExpression,
      'ArrowFunctionExpression:exit': exitExpression,
      ForStatement: enterForLoop,
      'ForStatement:exit': exitForLoop,
      ForInStatement: enterForLoop,
      'ForInStatement:exit': exitForLoop,
      ForOfStatement: enterForLoop,
      'ForOfStatement:exit': exitForLoop,
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) === 'test') {
          inTestCaseCall = true;
          return;
        }
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) === 'expect' && inTestCaseCall) {
          var _jestFnCall$head$node;
          if (expressionDepth === 1 && isFirstStatement(node) && ((_jestFnCall$head$node = jestFnCall.head.node.parent) === null || _jestFnCall$head$node === void 0 ? void 0 : _jestFnCall$head$node.type) === _utils.AST_NODE_TYPES.MemberExpression && jestFnCall.members.length === 1 && ['assertions', 'hasAssertions'].includes((0, _utils2.getAccessorValue)(jestFnCall.members[0]))) {
            checkExpectHasAssertions(jestFnCall, node);
            hasExpectAssertionsAsFirstStatement = true;
          }
          if (inForLoop) {
            hasExpectInLoop = true;
          }
          if (expressionDepth > 1) {
            hasExpectInCallback = true;
          }
        }
      },
      'CallExpression:exit'(node) {
        if (!(0, _utils2.isTypeOfJestFnCall)(node, context, ['test'])) {
          return;
        }
        inTestCaseCall = false;
        if (node.arguments.length < 2) {
          return;
        }
        const [, testFn] = node.arguments;
        if (!(0, _utils2.isFunction)(testFn) || !shouldCheckFunction(testFn)) {
          return;
        }
        hasExpectInLoop = false;
        hasExpectInCallback = false;
        if (hasExpectAssertionsAsFirstStatement) {
          hasExpectAssertionsAsFirstStatement = false;
          return;
        }
        const suggestions = [];
        if (testFn.body.type === _utils.AST_NODE_TYPES.BlockStatement) {
          suggestions.push(['suggestAddingHasAssertions', 'expect.hasAssertions();'], ['suggestAddingAssertions', 'expect.assertions();']);
        }
        context.report({
          messageId: 'haveExpectAssertions',
          node,
          suggest: suggestions.map(([messageId, text]) => ({
            messageId,
            fix: fixer => fixer.insertTextBeforeRange([testFn.body.range[0] + 1, testFn.body.range[1]], text)
          }))
        });
      }
    };
  }
});