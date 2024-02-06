"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveAccessibleName = toHaveAccessibleName;
var _domAccessibilityApi = require("dom-accessibility-api");
var _utils = require("./utils");
function toHaveAccessibleName(htmlElement, expectedAccessibleName) {
  (0, _utils.checkHtmlElement)(htmlElement, toHaveAccessibleName, this);
  const actualAccessibleName = (0, _domAccessibilityApi.computeAccessibleName)(htmlElement);
  const missingExpectedValue = arguments.length === 1;
  let pass = false;
  if (missingExpectedValue) {
    // When called without an expected value we only want to validate that the element has an
    // accessible name, whatever it may be.
    pass = actualAccessibleName !== '';
  } else {
    pass = expectedAccessibleName instanceof RegExp ? expectedAccessibleName.test(actualAccessibleName) : this.equals(actualAccessibleName, expectedAccessibleName);
  }
  return {
    pass,
    message: () => {
      const to = this.isNot ? 'not to' : 'to';
      return (0, _utils.getMessage)(this, this.utils.matcherHint(`${this.isNot ? '.not' : ''}.${toHaveAccessibleName.name}`, 'element', ''), `Expected element ${to} have accessible name`, expectedAccessibleName, 'Received', actualAccessibleName);
    }
  };
}