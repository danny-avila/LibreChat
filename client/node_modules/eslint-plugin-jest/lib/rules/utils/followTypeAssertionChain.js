"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.followTypeAssertionChain = void 0;
var _utils = require("@typescript-eslint/utils");
const isTypeCastExpression = node => node.type === _utils.AST_NODE_TYPES.TSAsExpression || node.type === _utils.AST_NODE_TYPES.TSTypeAssertion;
const followTypeAssertionChain = expression => isTypeCastExpression(expression) ? followTypeAssertionChain(expression.expression) : expression;
exports.followTypeAssertionChain = followTypeAssertionChain;