"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _envHelper = _interopRequireDefault(require("./envHelper"));

var _fingerprint = _interopRequireDefault(require("./fingerprint.lib"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-undef */
var HASH_KEY = "E86E2612010258B35137";
/**
 * Function to get browser finger print
 * @returns
 */

var getFingerprint = function getFingerprint() {
  var HASH_KEY_CUSTOM = _envHelper.default.getHashKey() || HASH_KEY;
  if (typeof window === "undefined") return HASH_KEY_CUSTOM;
  return _fingerprint.default.getFingerprint() + HASH_KEY_CUSTOM;
};

var _default = getFingerprint;
exports.default = _default;