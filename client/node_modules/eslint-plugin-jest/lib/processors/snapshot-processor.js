"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.preprocess = exports.postprocess = exports.meta = void 0;
var _package = require("../../package.json");
// https://eslint.org/docs/developer-guide/working-with-plugins#processors-in-plugins
// https://github.com/typescript-eslint/typescript-eslint/issues/808

const meta = exports.meta = {
  name: _package.name,
  version: _package.version
};
const preprocess = source => [source];
exports.preprocess = preprocess;
const postprocess = messages =>
// snapshot files should only be linted with snapshot specific rules
messages[0].filter(message => message.ruleId === 'jest/no-large-snapshots');
exports.postprocess = postprocess;