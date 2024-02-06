import _classCallCheck from "@babel/runtime/helpers/esm/classCallCheck";
import _createClass from "@babel/runtime/helpers/esm/createClass";
import _defineProperty from "@babel/runtime/helpers/esm/defineProperty";
import { getNumberPrecision, isEmpty, num2str } from "./numberUtil";

/**
 * We can remove this when IE not support anymore
 */
var NumberDecimal = /*#__PURE__*/function () {
  function NumberDecimal(value) {
    _classCallCheck(this, NumberDecimal);
    _defineProperty(this, "origin", '');
    _defineProperty(this, "number", void 0);
    _defineProperty(this, "empty", void 0);
    if (isEmpty(value)) {
      this.empty = true;
      return;
    }
    this.origin = String(value);
    this.number = Number(value);
  }
  _createClass(NumberDecimal, [{
    key: "negate",
    value: function negate() {
      return new NumberDecimal(-this.toNumber());
    }
  }, {
    key: "add",
    value: function add(value) {
      if (this.isInvalidate()) {
        return new NumberDecimal(value);
      }
      var target = Number(value);
      if (Number.isNaN(target)) {
        return this;
      }
      var number = this.number + target;

      // [Legacy] Back to safe integer
      if (number > Number.MAX_SAFE_INTEGER) {
        return new NumberDecimal(Number.MAX_SAFE_INTEGER);
      }
      if (number < Number.MIN_SAFE_INTEGER) {
        return new NumberDecimal(Number.MIN_SAFE_INTEGER);
      }
      var maxPrecision = Math.max(getNumberPrecision(this.number), getNumberPrecision(target));
      return new NumberDecimal(number.toFixed(maxPrecision));
    }
  }, {
    key: "multi",
    value: function multi(value) {
      var target = Number(value);
      if (this.isInvalidate() || Number.isNaN(target)) {
        return new NumberDecimal(NaN);
      }
      var number = this.number * target;

      // [Legacy] Back to safe integer
      if (number > Number.MAX_SAFE_INTEGER) {
        return new NumberDecimal(Number.MAX_SAFE_INTEGER);
      }
      if (number < Number.MIN_SAFE_INTEGER) {
        return new NumberDecimal(Number.MIN_SAFE_INTEGER);
      }
      var maxPrecision = Math.max(getNumberPrecision(this.number), getNumberPrecision(target));
      return new NumberDecimal(number.toFixed(maxPrecision));
    }
  }, {
    key: "isEmpty",
    value: function isEmpty() {
      return this.empty;
    }
  }, {
    key: "isNaN",
    value: function isNaN() {
      return Number.isNaN(this.number);
    }
  }, {
    key: "isInvalidate",
    value: function isInvalidate() {
      return this.isEmpty() || this.isNaN();
    }
  }, {
    key: "equals",
    value: function equals(target) {
      return this.toNumber() === (target === null || target === void 0 ? void 0 : target.toNumber());
    }
  }, {
    key: "lessEquals",
    value: function lessEquals(target) {
      return this.add(target.negate().toString()).toNumber() <= 0;
    }
  }, {
    key: "toNumber",
    value: function toNumber() {
      return this.number;
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
      return num2str(this.number);
    }
  }]);
  return NumberDecimal;
}();
export { NumberDecimal as default };