"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const isPromiseChainCall = node => {
  if (node.type === _utils.AST_NODE_TYPES.CallExpression && node.callee.type === _utils.AST_NODE_TYPES.MemberExpression && (0, _utils2.isSupportedAccessor)(node.callee.property)) {
    // promise methods should have at least 1 argument
    if (node.arguments.length === 0) {
      return false;
    }
    switch ((0, _utils2.getAccessorValue)(node.callee.property)) {
      case 'then':
        return node.arguments.length < 3;
      case 'catch':
      case 'finally':
        return node.arguments.length < 2;
    }
  }
  return false;
};
const isTestCaseCallWithCallbackArg = (node, context) => {
  const jestCallFn = (0, _utils2.parseJestFnCall)(node, context);
  if ((jestCallFn === null || jestCallFn === void 0 ? void 0 : jestCallFn.type) !== 'test') {
    return false;
  }
  const isJestEach = jestCallFn.members.some(s => (0, _utils2.getAccessorValue)(s) === 'each');
  if (isJestEach && node.callee.type !== _utils.AST_NODE_TYPES.TaggedTemplateExpression) {
    // isJestEach but not a TaggedTemplateExpression, so this must be
    // the `jest.each([])()` syntax which this rule doesn't support due
    // to its complexity (see jest-community/eslint-plugin-jest#710)
    // so we return true to trigger bailout
    return true;
  }
  const [, callback] = node.arguments;
  const callbackArgIndex = Number(isJestEach);
  return callback && (0, _utils2.isFunction)(callback) && callback.params.length === 1 + callbackArgIndex;
};
const isPromiseMethodThatUsesValue = (node, identifier) => {
  const {
    name
  } = identifier;
  if (node.argument === null) {
    return false;
  }
  if (node.argument.type === _utils.AST_NODE_TYPES.CallExpression && node.argument.arguments.length > 0) {
    const nodeName = (0, _utils2.getNodeName)(node.argument);
    if (['Promise.all', 'Promise.allSettled'].includes(nodeName)) {
      const [firstArg] = node.argument.arguments;
      if (firstArg.type === _utils.AST_NODE_TYPES.ArrayExpression && firstArg.elements.some(nod => nod && (0, _utils2.isIdentifier)(nod, name))) {
        return true;
      }
    }
    if (['Promise.resolve', 'Promise.reject'].includes(nodeName) && node.argument.arguments.length === 1) {
      return (0, _utils2.isIdentifier)(node.argument.arguments[0], name);
    }
  }
  return (0, _utils2.isIdentifier)(node.argument, name);
};

/**
 * Attempts to determine if the runtime value represented by the given `identifier`
 * is `await`ed within the given array of elements
 */
const isValueAwaitedInElements = (name, elements) => {
  for (const element of elements) {
    if ((element === null || element === void 0 ? void 0 : element.type) === _utils.AST_NODE_TYPES.AwaitExpression && (0, _utils2.isIdentifier)(element.argument, name)) {
      return true;
    }
    if ((element === null || element === void 0 ? void 0 : element.type) === _utils.AST_NODE_TYPES.ArrayExpression && isValueAwaitedInElements(name, element.elements)) {
      return true;
    }
  }
  return false;
};

/**
 * Attempts to determine if the runtime value represented by the given `identifier`
 * is `await`ed as an argument along the given call expression
 */
const isValueAwaitedInArguments = (name, call) => {
  let node = call;
  while (node) {
    if (node.type === _utils.AST_NODE_TYPES.CallExpression) {
      if (isValueAwaitedInElements(name, node.arguments)) {
        return true;
      }
      node = node.callee;
    }
    if (node.type !== _utils.AST_NODE_TYPES.MemberExpression) {
      break;
    }
    node = node.object;
  }
  return false;
};
const getLeftMostCallExpression = call => {
  let leftMostCallExpression = call;
  let node = call;
  while (node) {
    if (node.type === _utils.AST_NODE_TYPES.CallExpression) {
      leftMostCallExpression = node;
      node = node.callee;
    }
    if (node.type !== _utils.AST_NODE_TYPES.MemberExpression) {
      break;
    }
    node = node.object;
  }
  return leftMostCallExpression;
};

/**
 * Attempts to determine if the runtime value represented by the given `identifier`
 * is `await`ed or `return`ed within the given `body` of statements
 */
const isValueAwaitedOrReturned = (identifier, body, context) => {
  const {
    name
  } = identifier;
  for (const node of body) {
    // skip all nodes that are before this identifier, because they'd probably
    // be affecting a different runtime value (e.g. due to reassignment)
    if (node.range[0] <= identifier.range[0]) {
      continue;
    }
    if (node.type === _utils.AST_NODE_TYPES.ReturnStatement) {
      return isPromiseMethodThatUsesValue(node, identifier);
    }
    if (node.type === _utils.AST_NODE_TYPES.ExpressionStatement) {
      // it's possible that we're awaiting the value as an argument
      if (node.expression.type === _utils.AST_NODE_TYPES.CallExpression) {
        if (isValueAwaitedInArguments(name, node.expression)) {
          return true;
        }
        const leftMostCall = getLeftMostCallExpression(node.expression);
        const jestFnCall = (0, _utils2.parseJestFnCall)(node.expression, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) === 'expect' && leftMostCall.arguments.length > 0 && (0, _utils2.isIdentifier)(leftMostCall.arguments[0], name)) {
          if (jestFnCall.members.some(m => {
            const v = (0, _utils2.getAccessorValue)(m);
            return v === _utils2.ModifierName.resolves || v === _utils2.ModifierName.rejects;
          })) {
            return true;
          }
        }
      }
      if (node.expression.type === _utils.AST_NODE_TYPES.AwaitExpression && isPromiseMethodThatUsesValue(node.expression, identifier)) {
        return true;
      }

      // (re)assignment changes the runtime value, so if we've not found an
      // await or return already we act as if we've reached the end of the body
      if (node.expression.type === _utils.AST_NODE_TYPES.AssignmentExpression) {
        var _getNodeName;
        // unless we're assigning to the same identifier, in which case
        // we might be chaining off the existing promise value
        if ((0, _utils2.isIdentifier)(node.expression.left, name) && (_getNodeName = (0, _utils2.getNodeName)(node.expression.right)) !== null && _getNodeName !== void 0 && _getNodeName.startsWith(`${name}.`) && isPromiseChainCall(node.expression.right)) {
          continue;
        }
        break;
      }
    }
    if (node.type === _utils.AST_NODE_TYPES.BlockStatement && isValueAwaitedOrReturned(identifier, node.body, context)) {
      return true;
    }
  }
  return false;
};
const findFirstBlockBodyUp = node => {
  let parent = node;
  while (parent) {
    if (parent.type === _utils.AST_NODE_TYPES.BlockStatement) {
      return parent.body;
    }
    parent = parent.parent;
  }

  /* istanbul ignore next */
  throw new Error(`Could not find BlockStatement - please file a github issue at https://github.com/jest-community/eslint-plugin-jest`);
};
const isDirectlyWithinTestCaseCall = (node, context) => {
  let parent = node;
  while (parent) {
    if ((0, _utils2.isFunction)(parent)) {
      var _parent;
      parent = parent.parent;
      return ((_parent = parent) === null || _parent === void 0 ? void 0 : _parent.type) === _utils.AST_NODE_TYPES.CallExpression && (0, _utils2.isTypeOfJestFnCall)(parent, context, ['test']);
    }
    parent = parent.parent;
  }
  return false;
};
const isVariableAwaitedOrReturned = (variable, context) => {
  const body = findFirstBlockBodyUp(variable);

  // it's pretty much impossible for us to track destructuring assignments,
  // so we return true to bailout gracefully
  if (!(0, _utils2.isIdentifier)(variable.id)) {
    return true;
  }
  return isValueAwaitedOrReturned(variable.id, body, context);
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Require promises that have expectations in their chain to be valid',
      recommended: 'error'
    },
    messages: {
      expectInFloatingPromise: 'This promise should either be returned or awaited to ensure the expects in its chain are called'
    },
    type: 'suggestion',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    let inTestCaseWithDoneCallback = false;
    // an array of booleans representing each promise chain we enter, with the
    // boolean value representing if we think a given chain contains an expect
    // in it's body.
    //
    // since we only care about the inner-most chain, we represent the state in
    // reverse with the inner-most being the first item, as that makes it
    // slightly less code to assign to by not needing to know the length
    const chains = [];
    return {
      CallExpression(node) {
        // there are too many ways that the done argument could be used with
        // promises that contain expect that would make the promise safe for us
        if (isTestCaseCallWithCallbackArg(node, context)) {
          inTestCaseWithDoneCallback = true;
          return;
        }

        // if this call expression is a promise chain, add it to the stack with
        // value of "false", as we assume there are no expect calls initially
        if (isPromiseChainCall(node)) {
          chains.unshift(false);
          return;
        }

        // if we're within a promise chain, and this call expression looks like
        // an expect call, mark the deepest chain as having an expect call
        if (chains.length > 0 && (0, _utils2.isTypeOfJestFnCall)(node, context, ['expect'])) {
          chains[0] = true;
        }
      },
      'CallExpression:exit'(node) {
        // there are too many ways that the "done" argument could be used to
        // make promises containing expects safe in a test for us to be able to
        // accurately check, so we just bail out completely if it's present
        if (inTestCaseWithDoneCallback) {
          if ((0, _utils2.isTypeOfJestFnCall)(node, context, ['test'])) {
            inTestCaseWithDoneCallback = false;
          }
          return;
        }
        if (!isPromiseChainCall(node)) {
          return;
        }

        // since we're exiting this call expression (which is a promise chain)
        // we remove it from the stack of chains, since we're unwinding
        const hasExpectCall = chains.shift();

        // if the promise chain we're exiting doesn't contain an expect,
        // then we don't need to check it for anything
        if (!hasExpectCall) {
          return;
        }
        const {
          parent
        } = (0, _utils2.findTopMostCallExpression)(node);

        // if we don't have a parent (which is technically impossible at runtime)
        // or our parent is not directly within the test case, we stop checking
        // because we're most likely in the body of a function being defined
        // within the test, which we can't track
        if (!parent || !isDirectlyWithinTestCaseCall(parent, context)) {
          return;
        }
        switch (parent.type) {
          case _utils.AST_NODE_TYPES.VariableDeclarator:
            {
              if (isVariableAwaitedOrReturned(parent, context)) {
                return;
              }
              break;
            }
          case _utils.AST_NODE_TYPES.AssignmentExpression:
            {
              if (parent.left.type === _utils.AST_NODE_TYPES.Identifier && isValueAwaitedOrReturned(parent.left, findFirstBlockBodyUp(parent), context)) {
                return;
              }
              break;
            }
          case _utils.AST_NODE_TYPES.ExpressionStatement:
            break;
          case _utils.AST_NODE_TYPES.ReturnStatement:
          case _utils.AST_NODE_TYPES.AwaitExpression:
          default:
            return;
        }
        context.report({
          messageId: 'expectInFloatingPromise',
          node: parent
        });
      }
    };
  }
});