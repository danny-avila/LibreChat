"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveValue = toHaveValue;
var _isEqualWith = _interopRequireDefault(require("lodash/isEqualWith"));
var _utils = require("./utils");
function toHaveValue(htmlElement, expectedValue) {
  (0, _utils.checkHtmlElement)(htmlElement, toHaveValue, this);
  if (htmlElement.tagName.toLowerCase() === 'input' && ['checkbox', 'radio'].includes(htmlElement.type)) {
    throw new Error('input with type=checkbox or type=radio cannot be used with .toHaveValue(). Use .toBeChecked() for type=checkbox or .toHaveFormValues() instead');
  }
  const receivedValue = (0, _utils.getSingleElementValue)(htmlElement);
  const expectsValue = expectedValue !== undefined;
  let expectedTypedValue = expectedValue;
  let receivedTypedValue = receivedValue;
  if (expectedValue == receivedValue && expectedValue !== receivedValue) {
    expectedTypedValue = `${expectedValue} (${typeof expectedValue})`;
    receivedTypedValue = `${receivedValue} (${typeof receivedValue})`;
  }
  return {
    pass: expectsValue ? (0, _isEqualWith.default)(receivedValue, expectedValue, _utils.compareArraysAsSet) : Boolean(receivedValue),
    message: () => {
      const to = this.isNot ? 'not to' : 'to';
      const matcher = this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toHaveValue`, 'element', expectedValue);
      return (0, _utils.getMessage)(this, matcher, `Expected the element ${to} have value`, expectsValue ? expectedTypedValue : '(any)', 'Received', receivedTypedValue);
    }
  };
}