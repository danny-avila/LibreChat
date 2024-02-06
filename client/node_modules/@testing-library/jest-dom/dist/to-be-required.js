"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBeRequired = toBeRequired;
var _utils = require("./utils");
// form elements that support 'required'
const FORM_TAGS = ['select', 'textarea'];
const ARIA_FORM_TAGS = ['input', 'select', 'textarea'];
const UNSUPPORTED_INPUT_TYPES = ['color', 'hidden', 'range', 'submit', 'image', 'reset'];
const SUPPORTED_ARIA_ROLES = ['combobox', 'gridcell', 'radiogroup', 'spinbutton', 'tree'];
function isRequiredOnFormTagsExceptInput(element) {
  return FORM_TAGS.includes((0, _utils.getTag)(element)) && element.hasAttribute('required');
}
function isRequiredOnSupportedInput(element) {
  return (0, _utils.getTag)(element) === 'input' && element.hasAttribute('required') && (element.hasAttribute('type') && !UNSUPPORTED_INPUT_TYPES.includes(element.getAttribute('type')) || !element.hasAttribute('type'));
}
function isElementRequiredByARIA(element) {
  return element.hasAttribute('aria-required') && element.getAttribute('aria-required') === 'true' && (ARIA_FORM_TAGS.includes((0, _utils.getTag)(element)) || element.hasAttribute('role') && SUPPORTED_ARIA_ROLES.includes(element.getAttribute('role')));
}
function toBeRequired(element) {
  (0, _utils.checkHtmlElement)(element, toBeRequired, this);
  const isRequired = isRequiredOnFormTagsExceptInput(element) || isRequiredOnSupportedInput(element) || isElementRequiredByARIA(element);
  return {
    pass: isRequired,
    message: () => {
      const is = isRequired ? 'is' : 'is not';
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeRequired`, 'element', ''), '', `Received element ${is} required:`, `  ${this.utils.printReceived(element.cloneNode(false))}`].join('\n');
    }
  };
}