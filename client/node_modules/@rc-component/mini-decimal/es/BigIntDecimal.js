import _classCallCheck from "@babel/runtime/helpers/esm/classCallCheck";
import _createClass from "@babel/runtime/helpers/esm/createClass";
import _defineProperty from "@babel/runtime/helpers/esm/defineProperty";
import { isE, isEmpty, num2str, trimNumber, validateNumber } from "./numberUtil";
var BigIntDecimal = /*#__PURE__*/function () {
  /** BigInt will convert `0009` to `9`. We need record the len of decimal */

  function BigIntDecimal(value) {
    _classCallCheck(this, BigIntDecimal);
    _defineProperty(this, "origin", '');
    _defineProperty(this, "negative", void 0);
    _defineProperty(this, "integer", void 0);
    _defineProperty(this, "decimal", void 0);
    _defineProperty(this, "decimalLen", void 0);
    _defineProperty(this, "empty", void 0);
    _defineProperty(this, "nan", void 0);
    if (isEmpty(value)) {
      this.empty = true;
      return;
    }
    this.origin = String(value);

    // Act like Number convert
    if (value === '-' || Number.isNaN(value)) {
      this.nan = true;
      return;
    }
    var mergedValue = value;

    // We need convert back to Number since it require `toFixed` to handle this
    if (isE(mergedValue)) {
      mergedValue = Number(mergedValue);
    }
    mergedValue = typeof mergedValue === 'string' ? mergedValue : num2str(mergedValue);
    if (validateNumber(mergedValue)) {
      var trimRet = trimNumber(mergedValue);
      this.negative = trimRet.negative;
      var numbers = trimRet.trimStr.split('.');
      this.integer = BigInt(numbers[0]);
      var decimalStr = numbers[1] || '0';
      this.decimal = BigInt(decimalStr);
      this.decimalLen = decimalStr.length;
    } else {
      this.nan = true;
    }
  }
  _createClass(BigIntDecimal, [{
    key: "getMark",
    value: function getMark() {
      return this.negative ? '-' : '';
    }
  }, {
    key: "getIntegerStr",
    value: function getIntegerStr() {
      return this.integer.toString();
    }

    /**
     * @private get decimal string
     */
  }, {
    key: "getDecimalStr",
    value: function getDecimalStr() {
      return this.decimal.toString().padStart(this.decimalLen, '0');
    }

    /**
     * @private Align BigIntDecimal with same decimal length. e.g. 12.3 + 5 = 1230000
     * This is used for add function only.
     */
  }, {
    key: "alignDecimal",
    value: function alignDecimal(decimalLength) {
      var str = "".concat(this.getMark()).concat(this.getIntegerStr()).concat(this.getDecimalStr().padEnd(decimalLength, '0'));
      return BigInt(str);
    }
  }, {
    key: "negate",
    value: function negate() {
      var clone = new BigIntDecimal(this.toString());
      clone.negative = !clone.negative;
      return clone;
    }
  }, {
    key: "cal",
    value: function cal(offset, calculator, calDecimalLen) {
      var maxDecimalLength = Math.max(this.getDecimalStr().length, offset.getDecimalStr().length);
      var myAlignedDecimal = this.alignDecimal(maxDecimalLength);
      var offsetAlignedDecimal = offset.alignDecimal(maxDecimalLength);
      var valueStr = calculator(myAlignedDecimal, offsetAlignedDecimal).toString();
      var nextDecimalLength = calDecimalLen(maxDecimalLength);

      // We need fill string length back to `maxDecimalLength` to avoid parser failed
      var _trimNumber = trimNumber(valueStr),
        negativeStr = _trimNumber.negativeStr,
        trimStr = _trimNumber.trimStr;
      var hydrateValueStr = "".concat(negativeStr).concat(trimStr.padStart(nextDecimalLength + 1, '0'));
      return new BigIntDecimal("".concat(hydrateValueStr.slice(0, -nextDecimalLength), ".").concat(hydrateValueStr.slice(-nextDecimalLength)));
    }
  }, {
    key: "add",
    value: function add(value) {
      if (this.isInvalidate()) {
        return new BigIntDecimal(value);
      }
      var offset = new BigIntDecimal(value);
      if (offset.isInvalidate()) {
        return this;
      }
      return this.cal(offset, function (num1, num2) {
        return num1 + num2;
      }, function (len) {
        return len;
      });
    }
  }, {
    key: "multi",
    value: function multi(value) {
      var target = new BigIntDecimal(value);
      if (this.isInvalidate() || target.isInvalidate()) {
        return new BigIntDecimal(NaN);
      }
      return this.cal(target, function (num1, num2) {
        return num1 * num2;
      }, function (len) {
        return len * 2;
      });
    }
  }, {
    key: "isEmpty",
    value: function isEmpty() {
      return this.empty;
    }
  }, {
    key: "isNaN",
    value: function isNaN() {
      return this.nan;
    }
  }, {
    key: "isInvalidate",
    value: function isInvalidate() {
      return this.isEmpty() || this.isNaN();
    }
  }, {
    key: "equals",
    value: function equals(target) {
      return this.toString() === (target === null || target === void 0 ? void 0 : target.toString());
    }
  }, {
    key: "lessEquals",
    value: function lessEquals(target) {
      return this.add(target.negate().toString()).toNumber() <= 0;
    }
  }, {
    key: "toNumber",
    value: function toNumber() {
      if (this.isNaN()) {
        return NaN;
      }
      return Number(this.toString());
    }
  }, {
    key: "toString",
    value: function toString() {
      var safe = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;
      if (!safe) {
        return this.origin;
      }
      if (this.isInvalidate()) {
        return '';
      }
      return trimNumber("".concat(this.getMark()).concat(this.getIntegerStr(), ".").concat(this.getDecimalStr())).fullStr;
    }
  }]);
  return BigIntDecimal;
}();
export { BigIntDecimal as default };