"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  trimNumber: true,
  getNumberPrecision: true,
  num2str: true,
  validateNumber: true
};
exports.default = void 0;
Object.defineProperty(exports, "getNumberPrecision", {
  enumerable: true,
  get: function get() {
    return _numberUtil.getNumberPrecision;
  }
});
Object.defineProperty(exports, "num2str", {
  enumerable: true,
  get: function get() {
    return _numberUtil.num2str;
  }
});
Object.defineProperty(exports, "trimNumber", {
  enumerable: true,
  get: function get() {
    return _numberUtil.trimNumber;
  }
});
Object.defineProperty(exports, "validateNumber", {
  enumerable: true,
  get: function get() {
    return _numberUtil.validateNumber;
  }
});
var _MiniDecimal = _interopRequireWildcard(require("./MiniDecimal"));
Object.keys(_MiniDecimal).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _MiniDecimal[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _MiniDecimal[key];
    }
  });
});
var _numberUtil = require("./numberUtil");
var _default = _MiniDecimal.default;
exports.default = _default;