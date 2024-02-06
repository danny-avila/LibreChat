"use strict";

var _fs = require("fs");
var _path = require("path");
var _package = require("../package.json");
var _globals = _interopRequireDefault(require("./globals.json"));
var snapshotProcessor = _interopRequireWildcard(require("./processors/snapshot-processor"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && Object.prototype.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// v5 of `@typescript-eslint/experimental-utils` removed this

// copied from https://github.com/babel/babel/blob/d8da63c929f2d28c401571e2a43166678c555bc4/packages/babel-helpers/src/helpers.js#L602-L606
/* istanbul ignore next */
const interopRequireDefault = obj => obj && obj.__esModule ? obj : {
  default: obj
};
const importDefault = moduleName =>
// eslint-disable-next-line @typescript-eslint/no-require-imports
interopRequireDefault(require(moduleName)).default;
const rulesDir = (0, _path.join)(__dirname, 'rules');
const excludedFiles = ['__tests__', 'detectJestVersion', 'utils'];
const rules = Object.fromEntries((0, _fs.readdirSync)(rulesDir).map(rule => (0, _path.parse)(rule).name).filter(rule => !excludedFiles.includes(rule)).map(rule => [rule, importDefault((0, _path.join)(rulesDir, rule))]));
const recommendedRules = Object.fromEntries(Object.entries(rules).filter(([, rule]) => rule.meta.docs.recommended).map(([name, rule]) => [`jest/${name}`, rule.meta.docs.recommended]));
const allRules = Object.fromEntries(Object.entries(rules).filter(([, rule]) => !rule.meta.deprecated).map(([name]) => [`jest/${name}`, 'error']));
const createConfig = rules => ({
  plugins: ['jest'],
  env: {
    'jest/globals': true
  },
  rules
});
module.exports = {
  meta: {
    name: _package.name,
    version: _package.version
  },
  configs: {
    all: createConfig(allRules),
    recommended: createConfig(recommendedRules),
    style: createConfig({
      'jest/no-alias-methods': 'warn',
      'jest/prefer-to-be': 'error',
      'jest/prefer-to-contain': 'error',
      'jest/prefer-to-have-length': 'error'
    })
  },
  environments: {
    globals: {
      globals: _globals.default
    }
  },
  processors: {
    '.snap': snapshotProcessor
  },
  rules
};