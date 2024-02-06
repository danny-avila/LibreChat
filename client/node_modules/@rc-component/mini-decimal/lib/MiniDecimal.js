"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "BigIntDecimal", {
  enumerable: true,
  get: function get() {
    return _BigIntDecimal.default;
  }
});
Object.defineProperty(exports, "NumberDecimal", {
  enumerable: true,
  get: function get() {
    return _NumberDecimal.default;
  }
});
exports.default = getMiniDecimal;
exports.toFixed = toFixed;
var _BigIntDecimal = _interopRequireDefault(require("./BigIntDecimal"));
var _NumberDecimal = _interopRequireDefault(require("./NumberDecimal"));
var _numberUtil = require("./numberUtil");
var _supportUtil = require("./supportUtil");
/* eslint-disable max-classes-per-file */

// Still support origin export

function getMiniDecimal(value) {
  // We use BigInt here.
  // Will fallback to Number if not support.
  if ((0, _supportUtil.supportBigInt)()) {
    return new _BigIntDecimal.default(value);
  }
  return new _NumberDecimal.default(value);
}

/**
 * Align the logic of toFixed to around like 1.5 => 2.
 * If set `cutOnly`, will just remove the over decimal part.
 */
function toFixed(numStr, separatorStr, precision) {
  var cutOnly = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
  if (numStr === '') {
    return '';
  }
  var _trimNumber = (0, _numberUtil.trimNumber)(numStr),
    negativeStr = _trimNumber.negativeStr,
    integerStr = _trimNumber.integerStr,
    decimalStr = _trimNumber.decimalStr;
  var precisionDecimalStr = "".concat(separatorStr).concat(decimalStr);
  var numberWithoutDecimal = "".concat(negativeStr).concat(integerStr);
  if (precision >= 0) {
    // We will get last + 1 number to check if need advanced number
    var advancedNum = Number(decimalStr[precision]);
    if (advancedNum >= 5 && !cutOnly) {
      var advancedDecimal = getMiniDecimal(numStr).add("".concat(negativeStr, "0.").concat('0'.repeat(precision)).concat(10 - advancedNum));
      return toFixed(advancedDecimal.toString(), separatorStr, precision, cutOnly);
    }
    if (precision === 0) {
      return numberWithoutDecimal;
    }
    return "".concat(numberWithoutDecimal).concat(separatorStr).concat(decimalStr.padEnd(precision, '0').slice(0, precision));
  }
  if (precisionDecimalStr === '.0') {
    return numberWithoutDecimal;
  }
  return "".concat(numberWithoutDecimal).concat(precisionDecimalStr);
}