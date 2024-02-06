"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveAccessibleDescription = toHaveAccessibleDescription;
var _domAccessibilityApi = require("dom-accessibility-api");
var _utils = require("./utils");
function toHaveAccessibleDescription(htmlElement, expectedAccessibleDescription) {
  (0, _utils.checkHtmlElement)(htmlElement, toHaveAccessibleDescription, this);
  const actualAccessibleDescription = (0, _domAccessibilityApi.computeAccessibleDescription)(htmlElement);
  const missingExpectedValue = arguments.length === 1;
  let pass = false;
  if (missingExpectedValue) {
    // When called without an expected value we only want to validate that the element has an
    // accessible description, whatever it may be.
    pass = actualAccessibleDescription !== '';
  } else {
    pass = expectedAccessibleDescription instanceof RegExp ? expectedAccessibleDescription.test(actualAccessibleDescription) : this.equals(actualAccessibleDescription, expectedAccessibleDescription);
  }
  return {
    pass,
    message: () => {
      const to = this.isNot ? 'not to' : 'to';
      return (0, _utils.getMessage)(this, this.utils.matcherHint(`${this.isNot ? '.not' : ''}.${toHaveAccessibleDescription.name}`, 'element', ''), `Expected element ${to} have accessible description`, expectedAccessibleDescription, 'Received', actualAccessibleDescription);
    }
  };
}