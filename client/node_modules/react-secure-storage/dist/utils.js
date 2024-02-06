"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getSecurePrefix = exports.getDisabledKeys = exports.FINGERPRINT_KEYS = void 0;

var _envHelper = _interopRequireDefault(require("./envHelper"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Function which is used to get the secure prefix
 * @returns
 */
var getSecurePrefix = function getSecurePrefix() {
  var KEY_PREFIX = _envHelper.default.getStoragePrefix() || "@secure.";
  if (!KEY_PREFIX.endsWith(".")) return KEY_PREFIX + ".";
  return KEY_PREFIX;
};

exports.getSecurePrefix = getSecurePrefix;
var FINGERPRINT_KEYS = {
  USERAGENT: "UserAgent",
  SCREEN_PRINT: "ScreenPrint",
  PLUGINS: "Plugins",
  FONTS: "Fonts",
  LOCAL_STORAGE: "LocalStorage",
  SESSION_STORAGE: "SessionStorage",
  TIMEZONE: "TimeZone",
  LANGUAGE: "Language",
  SYSTEM_LANGUAGE: "SystemLanguage",
  COOKIE: "Cookie",
  CANVAS: "Canvas",
  HOSTNAME: "Hostname"
};
/**
 * Function which is used to get all the disabled keys
 * @returns
 */

exports.FINGERPRINT_KEYS = FINGERPRINT_KEYS;

var getDisabledKeys = function getDisabledKeys() {
  var DISABLED_KEYS = _envHelper.default.getDisabledKeys() || "";
  if (DISABLED_KEYS === "") return [];
  var allOptions = [FINGERPRINT_KEYS.USERAGENT, FINGERPRINT_KEYS.SCREEN_PRINT, FINGERPRINT_KEYS.PLUGINS, FINGERPRINT_KEYS.FONTS, FINGERPRINT_KEYS.LOCAL_STORAGE, FINGERPRINT_KEYS.SESSION_STORAGE, FINGERPRINT_KEYS.TIMEZONE, FINGERPRINT_KEYS.LANGUAGE, FINGERPRINT_KEYS.SYSTEM_LANGUAGE, FINGERPRINT_KEYS.COOKIE, FINGERPRINT_KEYS.CANVAS, FINGERPRINT_KEYS.HOSTNAME];
  var response = [];
  DISABLED_KEYS.split("|").forEach(function (key) {
    if (key === "") {} else if (allOptions.includes(key)) response.push(key);else console.warn("react-secure-storage : ".concat(key, " is not present in the available disabled keys options! Please go through the documentation"));
  });
  return response;
};

exports.getDisabledKeys = getDisabledKeys;