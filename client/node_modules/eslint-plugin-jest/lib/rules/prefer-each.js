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
      description: 'Prefer using `.each` rather than manual loops',
      recommended: false
    },
    messages: {
      preferEach: 'prefer using `{{ fn }}.each` rather than a manual loop'
    },
    type: 'suggestion',
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const jestFnCalls = [];
    let inTestCaseCall = false;
    const recommendFn = () => {
      if (jestFnCalls.length === 1 && jestFnCalls[0] === 'test') {
        return 'it';
      }
      return 'describe';
    };
    const enterForLoop = () => {
      if (jestFnCalls.length === 0 || inTestCaseCall) {
        return;
      }
      jestFnCalls.length = 0;
    };
    const exitForLoop = node => {
      if (jestFnCalls.length === 0 || inTestCaseCall) {
        return;
      }
      context.report({
        node,
        messageId: 'preferEach',
        data: {
          fn: recommendFn()
        }
      });
      jestFnCalls.length = 0;
    };
    return {
      ForStatement: enterForLoop,
      'ForStatement:exit': exitForLoop,
      ForInStatement: enterForLoop,
      'ForInStatement:exit': exitForLoop,
      ForOfStatement: enterForLoop,
      'ForOfStatement:exit': exitForLoop,
      CallExpression(node) {
        const {
          type: jestFnCallType
        } = (0, _utils.parseJestFnCall)(node, context) ?? {};
        if (jestFnCallType === 'hook' || jestFnCallType === 'describe' || jestFnCallType === 'test') {
          jestFnCalls.push(jestFnCallType);
        }
        if (jestFnCallType === 'test') {
          inTestCaseCall = true;
        }
      },
      'CallExpression:exit'(node) {
        const {
          type: jestFnCallType
        } = (0, _utils.parseJestFnCall)(node, context) ?? {};
        if (jestFnCallType === 'test') {
          inTestCaseCall = false;
        }
      }
    };
  }
});