"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _path = require("path");
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("./utils");
const reportOnViolation = (context, node, {
  maxSize: lineLimit = 50,
  allowedSnapshots = {}
}) => {
  const startLine = node.loc.start.line;
  const endLine = node.loc.end.line;
  const lineCount = endLine - startLine;
  const allPathsAreAbsolute = Object.keys(allowedSnapshots).every(_path.isAbsolute);
  if (!allPathsAreAbsolute) {
    throw new Error('All paths for allowedSnapshots must be absolute. You can use JS config and `path.resolve`');
  }
  let isAllowed = false;
  if (node.type === _utils.AST_NODE_TYPES.ExpressionStatement && 'left' in node.expression && node.expression.left.type === _utils.AST_NODE_TYPES.MemberExpression && (0, _utils2.isSupportedAccessor)(node.expression.left.property)) {
    const fileName = (0, _utils2.getFilename)(context);
    const allowedSnapshotsInFile = allowedSnapshots[fileName];
    if (allowedSnapshotsInFile) {
      const snapshotName = (0, _utils2.getAccessorValue)(node.expression.left.property);
      isAllowed = allowedSnapshotsInFile.some(name => {
        if (name instanceof RegExp) {
          return name.test(snapshotName);
        }
        return snapshotName === name;
      });
    }
  }
  if (!isAllowed && lineCount > lineLimit) {
    context.report({
      messageId: lineLimit === 0 ? 'noSnapshot' : 'tooLongSnapshots',
      data: {
        lineLimit,
        lineCount
      },
      node
    });
  }
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      category: 'Best Practices',
      description: 'Disallow large snapshots',
      recommended: false
    },
    messages: {
      noSnapshot: '`{{ lineCount }}`s should begin with lowercase',
      tooLongSnapshots: 'Expected Jest snapshot to be smaller than {{ lineLimit }} lines but was {{ lineCount }} lines long'
    },
    type: 'suggestion',
    schema: [{
      type: 'object',
      properties: {
        maxSize: {
          type: 'number'
        },
        inlineMaxSize: {
          type: 'number'
        },
        allowedSnapshots: {
          type: 'object',
          additionalProperties: {
            type: 'array'
          }
        }
      },
      additionalProperties: false
    }]
  },
  defaultOptions: [{}],
  create(context, [options]) {
    if (context.getFilename().endsWith('.snap')) {
      return {
        ExpressionStatement(node) {
          reportOnViolation(context, node, options);
        }
      };
    }
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if ((jestFnCall === null || jestFnCall === void 0 ? void 0 : jestFnCall.type) !== 'expect') {
          return;
        }
        if (['toMatchInlineSnapshot', 'toThrowErrorMatchingInlineSnapshot'].includes((0, _utils2.getAccessorValue)(jestFnCall.matcher)) && jestFnCall.args.length) {
          reportOnViolation(context, jestFnCall.args[0], {
            ...options,
            maxSize: options.inlineMaxSize ?? options.maxSize
          });
        }
      }
    };
  }
});