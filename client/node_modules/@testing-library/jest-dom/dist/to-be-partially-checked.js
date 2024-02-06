"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBePartiallyChecked = toBePartiallyChecked;
var _utils = require("./utils");
function toBePartiallyChecked(element) {
  (0, _utils.checkHtmlElement)(element, toBePartiallyChecked, this);
  const isValidInput = () => {
    return element.tagName.toLowerCase() === 'input' && element.type === 'checkbox';
  };
  const isValidAriaElement = () => {
    return element.getAttribute('role') === 'checkbox';
  };
  if (!isValidInput() && !isValidAriaElement()) {
    return {
      pass: false,
      message: () => 'only inputs with type="checkbox" or elements with role="checkbox" and a valid aria-checked attribute can be used with .toBePartiallyChecked(). Use .toHaveValue() instead'
    };
  }
  const isPartiallyChecked = () => {
    const isAriaMixed = element.getAttribute('aria-checked') === 'mixed';
    if (isValidInput()) {
      return element.indeterminate || isAriaMixed;
    }
    return isAriaMixed;
  };
  return {
    pass: isPartiallyChecked(),
    message: () => {
      const is = isPartiallyChecked() ? 'is' : 'is not';
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBePartiallyChecked`, 'element', ''), '', `Received element ${is} partially checked:`, `  ${this.utils.printReceived(element.cloneNode(false))}`].join('\n');
    }
  };
}