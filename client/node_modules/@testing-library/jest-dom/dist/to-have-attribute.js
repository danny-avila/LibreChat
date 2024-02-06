"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveAttribute = toHaveAttribute;
var _utils = require("./utils");
function printAttribute(stringify, name, value) {
  return value === undefined ? name : `${name}=${stringify(value)}`;
}
function getAttributeComment(stringify, name, value) {
  return value === undefined ? `element.hasAttribute(${stringify(name)})` : `element.getAttribute(${stringify(name)}) === ${stringify(value)}`;
}
function toHaveAttribute(htmlElement, name, expectedValue) {
  (0, _utils.checkHtmlElement)(htmlElement, toHaveAttribute, this);
  const isExpectedValuePresent = expectedValue !== undefined;
  const hasAttribute = htmlElement.hasAttribute(name);
  const receivedValue = htmlElement.getAttribute(name);
  return {
    pass: isExpectedValuePresent ? hasAttribute && this.equals(receivedValue, expectedValue) : hasAttribute,
    message: () => {
      const to = this.isNot ? 'not to' : 'to';
      const receivedAttribute = hasAttribute ? printAttribute(this.utils.stringify, name, receivedValue) : null;
      const matcher = this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toHaveAttribute`, 'element', this.utils.printExpected(name), {
        secondArgument: isExpectedValuePresent ? this.utils.printExpected(expectedValue) : undefined,
        comment: getAttributeComment(this.utils.stringify, name, expectedValue)
      });
      return (0, _utils.getMessage)(this, matcher, `Expected the element ${to} have attribute`, printAttribute(this.utils.stringify, name, expectedValue), 'Received', receivedAttribute);
    }
  };
}