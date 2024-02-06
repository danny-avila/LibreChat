"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBeDisabled = toBeDisabled;
exports.toBeEnabled = toBeEnabled;
var _utils = require("./utils");
// form elements that support 'disabled'
const FORM_TAGS = ['fieldset', 'input', 'select', 'optgroup', 'option', 'button', 'textarea'];

/*
 * According to specification:
 * If <fieldset> is disabled, the form controls that are its descendants,
 * except descendants of its first optional <legend> element, are disabled
 *
 * https://html.spec.whatwg.org/multipage/form-elements.html#concept-fieldset-disabled
 *
 * This method tests whether element is first legend child of fieldset parent
 */
function isFirstLegendChildOfFieldset(element, parent) {
  return (0, _utils.getTag)(element) === 'legend' && (0, _utils.getTag)(parent) === 'fieldset' && element.isSameNode(Array.from(parent.children).find(child => (0, _utils.getTag)(child) === 'legend'));
}
function isElementDisabledByParent(element, parent) {
  return isElementDisabled(parent) && !isFirstLegendChildOfFieldset(element, parent);
}
function isCustomElement(tag) {
  return tag.includes('-');
}

/*
 * Only certain form elements and custom elements can actually be disabled:
 * https://html.spec.whatwg.org/multipage/semantics-other.html#disabled-elements
 */
function canElementBeDisabled(element) {
  const tag = (0, _utils.getTag)(element);
  return FORM_TAGS.includes(tag) || isCustomElement(tag);
}
function isElementDisabled(element) {
  return canElementBeDisabled(element) && element.hasAttribute('disabled');
}
function isAncestorDisabled(element) {
  const parent = element.parentElement;
  return Boolean(parent) && (isElementDisabledByParent(element, parent) || isAncestorDisabled(parent));
}
function isElementOrAncestorDisabled(element) {
  return canElementBeDisabled(element) && (isElementDisabled(element) || isAncestorDisabled(element));
}
function toBeDisabled(element) {
  (0, _utils.checkHtmlElement)(element, toBeDisabled, this);
  const isDisabled = isElementOrAncestorDisabled(element);
  return {
    pass: isDisabled,
    message: () => {
      const is = isDisabled ? 'is' : 'is not';
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeDisabled`, 'element', ''), '', `Received element ${is} disabled:`, `  ${this.utils.printReceived(element.cloneNode(false))}`].join('\n');
    }
  };
}
function toBeEnabled(element) {
  (0, _utils.checkHtmlElement)(element, toBeEnabled, this);
  const isEnabled = !isElementOrAncestorDisabled(element);
  return {
    pass: isEnabled,
    message: () => {
      const is = isEnabled ? 'is' : 'is not';
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeEnabled`, 'element', ''), '', `Received element ${is} enabled:`, `  ${this.utils.printReceived(element.cloneNode(false))}`].join('\n');
    }
  };
}