"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
/*
 * This implementation is ported from from eslint-plugin-jasmine.
 * MIT license, Tom Vincent.
 */

/**
 * Async assertions might be called in Promise
 * methods like `Promise.x(expect1)` or `Promise.x([expect1, expect2])`.
 * If that's the case, Promise node have to be awaited or returned.
 *
 * @Returns CallExpressionNode
 */
const getPromiseCallExpressionNode = node => {
  if (node.type === _utils.AST_NODE_TYPES.ArrayExpression && node.parent && node.parent.type === _utils.AST_NODE_TYPES.CallExpression) {
    node = node.parent;
  }
  if (node.type === _utils.AST_NODE_TYPES.CallExpression && node.callee.type === _utils.AST_NODE_TYPES.MemberExpression && (0, _utils2.isSupportedAccessor)(node.callee.object, 'Promise') && node.parent) {
    return node;
  }
  return null;
};
const findPromiseCallExpressionNode = node => {
  var _node$parent;
  return (_node$parent = node.parent) !== null && _node$parent !== void 0 && _node$parent.parent && [_utils.AST_NODE_TYPES.CallExpression, _utils.AST_NODE_TYPES.ArrayExpression].includes(node.parent.type) ? getPromiseCallExpressionNode(node.parent) : null;
};
const getParentIfThenified = node => {
  var _node$parent2;
  const grandParentNode = (_node$parent2 = node.parent) === null || _node$parent2 === void 0 ? void 0 : _node$parent2.parent;
  if (grandParentNode && grandParentNode.type === _utils.AST_NODE_TYPES.CallExpression && grandParentNode.callee.type === _utils.AST_NODE_TYPES.MemberExpression && (0, _utils2.isSupportedAccessor)(grandParentNode.callee.property) && ['then', 'catch'].includes((0, _utils2.getAccessorValue)(grandParentNode.callee.property)) && grandParentNode.parent) {
    // Just in case `then`s are chained look one above.
    return getParentIfThenified(grandParentNode);
  }
  return node;
};
const isAcceptableReturnNode = (node, allowReturn) => {
  if (allowReturn && node.type === _utils.AST_NODE_TYPES.ReturnStatement) {
    return true;
  }
  if (node.type === _utils.AST_NODE_TYPES.ConditionalExpression && node.parent) {
    return isAcceptableReturnNode(node.parent, allowReturn);
  }
  return [_utils.AST_NODE_TYPES.ArrowFunctionExpression, _utils.AST_NODE_TYPES.AwaitExpression].includes(node.type);
};
const promiseArrayExceptionKey = ({
  start,
  end
}) => `${start.line}:${start.column}-${end.line}:${end.column}`;
const defaultAsyncMatchers = ['toReject', 'toResolve'];
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Enforce valid `expect()` usage',
      recommended: 'error'
    },
    messages: {
      tooManyArgs: 'Expect takes at most {{ amount }} argument{{ s }}',
      notEnoughArgs: 'Expect requires at least {{ amount }} argument{{ s }}',
      modifierUnknown: 'Expect has an unknown modifier',
      matcherNotFound: 'Expect must have a corresponding matcher call',
      matcherNotCalled: 'Matchers must be called to assert',
      asyncMustBeAwaited: 'Async assertions must be awaited{{ orReturned }}',
      promisesWithAsyncAssertionsMustBeAwaited: 'Promises which return async assertions must be awaited{{ orReturned }}'
    },
    type: 'suggestion',
    schema: [{
      type: 'object',
      properties: {
        alwaysAwait: {
          type: 'boolean',
          default: false
        },
        asyncMatchers: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        minArgs: {
          type: 'number',
          minimum: 1
        },
        maxArgs: {
          type: 'number',
          minimum: 1
        }
      },
      additionalProperties: false
    }]
  },
  defaultOptions: [{
    alwaysAwait: false,
    asyncMatchers: defaultAsyncMatchers,
    minArgs: 1,
    maxArgs: 1
  }],
  create(context, [{
    alwaysAwait,
    asyncMatchers = defaultAsyncMatchers,
    minArgs = 1,
    maxArgs = 1
  }]) {
    // Context state
    const arrayExceptions = new Set();
    const pushPromiseArrayException = loc => arrayExceptions.add(promiseArrayExceptionKey(loc));

    /**
     * Promise method that accepts an array of promises,
     * (eg. Promise.all), will throw warnings for the each
     * unawaited or non-returned promise. To avoid throwing
     * multiple warnings, we check if there is a warning in
     * the given location.
     */
    const promiseArrayExceptionExists = loc => arrayExceptions.has(promiseArrayExceptionKey(loc));
    const findTopMostMemberExpression = node => {
      let topMostMemberExpression = node;
      let {
        parent
      } = node;
      while (parent) {
        if (parent.type !== _utils.AST_NODE_TYPES.MemberExpression) {
          break;
        }
        topMostMemberExpression = parent;
        parent = parent.parent;
      }
      return topMostMemberExpression;
    };
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCallWithReason)(node, context);
        if (typeof jestFnCall === 'string') {
          var _node$parent3;
          const reportingNode = ((_node$parent3 = node.parent) === null || _node$parent3 === void 0 ? void 0 : _node$parent3.type) === _utils.AST_NODE_TYPES.MemberExpression ? findTopMostMemberExpression(node.parent).property : node;
          if (jestFnCall === 'matcher-not-found') {
            context.report({
              messageId: 'matcherNotFound',
              node: reportingNode
            });
            return;
          }
          if (jestFnCall === 'matcher-not-called') {
            context.report({
              messageId: (0, _utils2.isSupportedAccessor)(reportingNode) && _utils2.ModifierName.hasOwnProperty((0, _utils2.getAccessorValue)(reportingNode)) ? 'matcherNotFound' : 'matcherNotCalled',
              node: reportingNode
            });
          }
          if (jestFnCall === 'modifier-unknown') {
            context.report({
              messageId: 'modifierUnknown',
              node: reportingNode
            });
            return;
          }
          return;
        } else if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          return;
        }
        const {
          parent: expect
        } = jestFnCall.head.node;
        if ((expect === null || expect === void 0 ? void 0 : expect.type) !== _utils.AST_NODE_TYPES.CallExpression) {
          return;
        }
        if (expect.arguments.length < minArgs) {
          const expectLength = (0, _utils2.getAccessorValue)(jestFnCall.head.node).length;
          const loc = {
            start: {
              column: expect.loc.start.column + expectLength,
              line: expect.loc.start.line
            },
            end: {
              column: expect.loc.start.column + expectLength + 1,
              line: expect.loc.start.line
            }
          };
          context.report({
            messageId: 'notEnoughArgs',
            data: {
              amount: minArgs,
              s: minArgs === 1 ? '' : 's'
            },
            node: expect,
            loc
          });
        }
        if (expect.arguments.length > maxArgs) {
          const {
            start
          } = expect.arguments[maxArgs].loc;
          const {
            end
          } = expect.arguments[expect.arguments.length - 1].loc;
          const loc = {
            start,
            end: {
              column: end.column - 1,
              line: end.line
            }
          };
          context.report({
            messageId: 'tooManyArgs',
            data: {
              amount: maxArgs,
              s: maxArgs === 1 ? '' : 's'
            },
            node: expect,
            loc
          });
        }
        const {
          matcher
        } = jestFnCall;
        const parentNode = matcher.parent.parent;
        const shouldBeAwaited = jestFnCall.modifiers.some(nod => (0, _utils2.getAccessorValue)(nod) !== 'not') || asyncMatchers.includes((0, _utils2.getAccessorValue)(matcher));
        if (!(parentNode !== null && parentNode !== void 0 && parentNode.parent) || !shouldBeAwaited) {
          return;
        }
        /**
         * If parent node is an array expression, we'll report the warning,
         * for the array object, not for each individual assertion.
         */
        const isParentArrayExpression = parentNode.parent.type === _utils.AST_NODE_TYPES.ArrayExpression;
        const orReturned = alwaysAwait ? '' : ' or returned';
        /**
         * An async assertion can be chained with `then` or `catch` statements.
         * In that case our target CallExpression node is the one with
         * the last `then` or `catch` statement.
         */
        const targetNode = getParentIfThenified(parentNode);
        const finalNode = findPromiseCallExpressionNode(targetNode) || targetNode;
        if (finalNode.parent &&
        // If node is not awaited or returned
        !isAcceptableReturnNode(finalNode.parent, !alwaysAwait) &&
        // if we didn't warn user already
        !promiseArrayExceptionExists(finalNode.loc)) {
          context.report({
            loc: finalNode.loc,
            data: {
              orReturned
            },
            messageId: finalNode === targetNode ? 'asyncMustBeAwaited' : 'promisesWithAsyncAssertionsMustBeAwaited',
            node
          });
          if (isParentArrayExpression) {
            pushPromiseArrayException(finalNode.loc);
          }
        }
      }
    };
  }
});