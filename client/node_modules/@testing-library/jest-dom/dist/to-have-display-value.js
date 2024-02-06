"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveDisplayValue = toHaveDisplayValue;
var _utils = require("./utils");
function toHaveDisplayValue(htmlElement, expectedValue) {
  (0, _utils.checkHtmlElement)(htmlElement, toHaveDisplayValue, this);
  const tagName = htmlElement.tagName.toLowerCase();
  if (!['select', 'input', 'textarea'].includes(tagName)) {
    throw new Error('.toHaveDisplayValue() currently supports only input, textarea or select elements, try with another matcher instead.');
  }
  if (tagName === 'input' && ['radio', 'checkbox'].includes(htmlElement.type)) {
    throw new Error(`.toHaveDisplayValue() currently does not support input[type="${htmlElement.type}"], try with another matcher instead.`);
  }
  const values = getValues(tagName, htmlElement);
  const expectedValues = getExpectedValues(expectedValue);
  const numberOfMatchesWithValues = expectedValues.filter(expected => values.some(value => expected instanceof RegExp ? expected.test(value) : this.equals(value, String(expected)))).length;
  const matchedWithAllValues = numberOfMatchesWithValues === values.length;
  const matchedWithAllExpectedValues = numberOfMatchesWithValues === expectedValues.length;
  return {
    pass: matchedWithAllValues && matchedWithAllExpectedValues,
    message: () => (0, _utils.getMessage)(this, this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toHaveDisplayValue`, 'element', ''), `Expected element ${this.isNot ? 'not ' : ''}to have display value`, expectedValue, 'Received', values)
  };
}
function getValues(tagName, htmlElement) {
  return tagName === 'select' ? Array.from(htmlElement).filter(option => option.selected).map(option => option.textContent) : [htmlElement.value];
}
function getExpectedValues(expectedValue) {
  return expectedValue instanceof Array ? expectedValue : [expectedValue];
}