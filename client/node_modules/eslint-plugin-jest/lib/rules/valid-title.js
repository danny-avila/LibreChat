"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const trimFXprefix = word => ['f', 'x'].includes(word.charAt(0)) ? word.substring(1) : word;
const doesBinaryExpressionContainStringNode = binaryExp => {
  if ((0, _utils2.isStringNode)(binaryExp.right)) {
    return true;
  }
  if (binaryExp.left.type === _utils.AST_NODE_TYPES.BinaryExpression) {
    return doesBinaryExpressionContainStringNode(binaryExp.left);
  }
  return (0, _utils2.isStringNode)(binaryExp.left);
};
const quoteStringValue = node => node.type === _utils.AST_NODE_TYPES.TemplateLiteral ? `\`${node.quasis[0].value.raw}\`` : node.raw;
const compileMatcherPattern = matcherMaybeWithMessage => {
  const [matcher, message] = Array.isArray(matcherMaybeWithMessage) ? matcherMaybeWithMessage : [matcherMaybeWithMessage];
  return [new RegExp(matcher, 'u'), message];
};
const compileMatcherPatterns = matchers => {
  if (typeof matchers === 'string' || Array.isArray(matchers)) {
    const compiledMatcher = compileMatcherPattern(matchers);
    return {
      describe: compiledMatcher,
      test: compiledMatcher,
      it: compiledMatcher
    };
  }
  return {
    describe: matchers.describe ? compileMatcherPattern(matchers.describe) : null,
    test: matchers.test ? compileMatcherPattern(matchers.test) : null,
    it: matchers.it ? compileMatcherPattern(matchers.it) : null
  };
};
const MatcherAndMessageSchema = {
  type: 'array',
  items: {
    type: 'string'
  },
  minItems: 1,
  maxItems: 2,
  additionalItems: false
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Enforce valid titles',
      recommended: 'error'
    },
    messages: {
      titleMustBeString: 'Title must be a string',
      emptyTitle: '{{ jestFunctionName }} should not have an empty title',
      duplicatePrefix: 'should not have duplicate prefix',
      accidentalSpace: 'should not have leading or trailing spaces',
      disallowedWord: '"{{ word }}" is not allowed in test titles',
      mustNotMatch: '{{ jestFunctionName }} should not match {{ pattern }}',
      mustMatch: '{{ jestFunctionName }} should match {{ pattern }}',
      mustNotMatchCustom: '{{ message }}',
      mustMatchCustom: '{{ message }}'
    },
    type: 'suggestion',
    schema: [{
      type: 'object',
      properties: {
        ignoreSpaces: {
          type: 'boolean',
          default: false
        },
        ignoreTypeOfDescribeName: {
          type: 'boolean',
          default: false
        },
        ignoreTypeOfTestName: {
          type: 'boolean',
          default: false
        },
        disallowedWords: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      },
      patternProperties: {
        [/^must(?:Not)?Match$/u.source]: {
          oneOf: [{
            type: 'string'
          }, MatcherAndMessageSchema, {
            type: 'object',
            propertyNames: {
              enum: ['describe', 'test', 'it']
            },
            additionalProperties: {
              oneOf: [{
                type: 'string'
              }, MatcherAndMessageSchema]
            }
          }]
        }
      },
      additionalProperties: false
    }],
    fixable: 'code'
  },
  defaultOptions: [{
    ignoreSpaces: false,
    ignoreTypeOfDescribeName: false,
    ignoreTypeOfTestName: false,
    disallowedWords: []
  }],
  create(context, [{
    ignoreSpaces,
    ignoreTypeOfDescribeName,
    ignoreTypeOfTestName,
    disallowedWords = [],
    mustNotMatch,
    mustMatch
  }]) {
    const disallowedWordsRegexp = new RegExp(`\\b(${disallowedWords.join('|')})\\b`, 'iu');
    const mustNotMatchPatterns = compileMatcherPatterns(mustNotMatch ?? {});
    const mustMatchPatterns = compileMatcherPatterns(mustMatch ?? {});
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'describe' && (jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'test') {
          return;
        }
        const [argument] = node.arguments;
        if (!argument) {
          return;
        }
        if (!(0, _utils2.isStringNode)(argument)) {
          if (argument.type === _utils.AST_NODE_TYPES.BinaryExpression && doesBinaryExpressionContainStringNode(argument)) {
            return;
          }
          if (!(jestFnCall.type === 'describe' && ignoreTypeOfDescribeName || jestFnCall.type === 'test' && ignoreTypeOfTestName) && argument.type !== _utils.AST_NODE_TYPES.TemplateLiteral) {
            context.report({
              messageId: 'titleMustBeString',
              loc: argument.loc
            });
          }
          return;
        }
        const title = (0, _utils2.getStringValue)(argument);
        if (!title) {
          context.report({
            messageId: 'emptyTitle',
            data: {
              jestFunctionName: jestFnCall.type === 'describe' ? _utils2.DescribeAlias.describe : _utils2.TestCaseName.test
            },
            node
          });
          return;
        }
        if (disallowedWords.length > 0) {
          const disallowedMatch = disallowedWordsRegexp.exec(title);
          if (disallowedMatch) {
            context.report({
              data: {
                word: disallowedMatch[1]
              },
              messageId: 'disallowedWord',
              node: argument
            });
            return;
          }
        }
        if (ignoreSpaces === false && title.trim().length !== title.length) {
          context.report({
            messageId: 'accidentalSpace',
            node: argument,
            fix: fixer => [fixer.replaceTextRange(argument.range, quoteStringValue(argument).replace(/^([`'"]) +?/u, '$1').replace(/ +?([`'"])$/u, '$1'))]
          });
        }
        const unprefixedName = trimFXprefix(jestFnCall.name);
        const [firstWord] = title.split(' ');
        if (firstWord.toLowerCase() === unprefixedName) {
          context.report({
            messageId: 'duplicatePrefix',
            node: argument,
            fix: fixer => [fixer.replaceTextRange(argument.range, quoteStringValue(argument).replace(/^([`'"]).+? /u, '$1'))]
          });
        }
        const jestFunctionName = unprefixedName;
        const [mustNotMatchPattern, mustNotMatchMessage] = mustNotMatchPatterns[jestFunctionName] ?? [];
        if (mustNotMatchPattern) {
          if (mustNotMatchPattern.test(title)) {
            context.report({
              messageId: mustNotMatchMessage ? 'mustNotMatchCustom' : 'mustNotMatch',
              node: argument,
              data: {
                jestFunctionName,
                pattern: mustNotMatchPattern,
                message: mustNotMatchMessage
              }
            });
            return;
          }
        }
        const [mustMatchPattern, mustMatchMessage] = mustMatchPatterns[jestFunctionName] ?? [];
        if (mustMatchPattern) {
          if (!mustMatchPattern.test(title)) {
            context.report({
              messageId: mustMatchMessage ? 'mustMatchCustom' : 'mustMatch',
              node: argument,
              data: {
                jestFunctionName,
                pattern: mustMatchPattern,
                message: mustMatchMessage
              }
            });
            return;
          }
        }
      }
    };
  }
});