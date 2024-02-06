"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
const snapshotMatchers = ['toMatchSnapshot', 'toThrowErrorMatchingSnapshot'];
const snapshotMatcherNames = snapshotMatchers;
const isSnapshotMatcherWithoutHint = expectFnCall => {
  if (expectFnCall.args.length === 0) {
    return true;
  }

  // this matcher only supports one argument which is the hint
  if (!(0, _utils.isSupportedAccessor)(expectFnCall.matcher, 'toMatchSnapshot')) {
    return expectFnCall.args.length !== 1;
  }

  // if we're being passed two arguments,
  // the second one should be the hint
  if (expectFnCall.args.length === 2) {
    return false;
  }
  const [arg] = expectFnCall.args;

  // the first argument to `toMatchSnapshot` can be _either_ a snapshot hint or
  // an object with asymmetric matchers, so we can't just assume that the first
  // argument is a hint when it's by itself.
  return !(0, _utils.isStringNode)(arg);
};
const messages = {
  missingHint: 'You should provide a hint for this snapshot'
};
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Prefer including a hint with external snapshots',
      recommended: false
    },
    messages,
    type: 'suggestion',
    schema: [{
      type: 'string',
      enum: ['always', 'multi']
    }]
  },
  defaultOptions: ['multi'],
  create(context, [mode]) {
    const snapshotMatchers = [];
    const depths = [];
    let expressionDepth = 0;
    const reportSnapshotMatchersWithoutHints = () => {
      for (const snapshotMatcher of snapshotMatchers) {
        if (isSnapshotMatcherWithoutHint(snapshotMatcher)) {
          context.report({
            messageId: 'missingHint',
            node: snapshotMatcher.matcher
          });
        }
      }
    };
    const enterExpression = () => {
      expressionDepth++;
    };
    const exitExpression = () => {
      expressionDepth--;
      if (mode === 'always') {
        reportSnapshotMatchersWithoutHints();
        snapshotMatchers.length = 0;
      }
      if (mode === 'multi' && expressionDepth === 0) {
        if (snapshotMatchers.length > 1) {
          reportSnapshotMatchersWithoutHints();
        }
        snapshotMatchers.length = 0;
      }
    };
    return {
      'Program:exit'() {
        enterExpression();
        exitExpression();
      },
      FunctionExpression: enterExpression,
      'FunctionExpression:exit': exitExpression,
      ArrowFunctionExpression: enterExpression,
      'ArrowFunctionExpression:exit': exitExpression,
      'CallExpression:exit'(node) {
        if ((0, _utils.isTypeOfJestFnCall)(node, context, ['describe', 'test'])) {
          /* istanbul ignore next */
          expressionDepth = depths.pop() ?? 0;
        }
      },
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) === 'describe' || (jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) === 'test') {
            depths.push(expressionDepth);
            expressionDepth = 0;
          }
          return;
        }
        const matcherName = (0, _utils.getAccessorValue)(jestFnCall.matcher);
        if (!snapshotMatcherNames.includes(matcherName)) {
          return;
        }
        snapshotMatchers.push(jestFnCall);
      }
    };
  }
});