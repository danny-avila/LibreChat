"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBeChecked = toBeChecked;
var _ariaQuery = require("aria-query");
var _utils = require("./utils");
function toBeChecked(element) {
  (0, _utils.checkHtmlElement)(element, toBeChecked, this);
  const isValidInput = () => {
    return element.tagName.toLowerCase() === 'input' && ['checkbox', 'radio'].includes(element.type);
  };
  const isValidAriaElement = () => {
    return roleSupportsChecked(element.getAttribute('role')) && ['true', 'false'].includes(element.getAttribute('aria-checked'));
  };
  if (!isValidInput() && !isValidAriaElement()) {
    return {
      pass: false,
      message: () => `only inputs with type="checkbox" or type="radio" or elements with ${supportedRolesSentence()} and a valid aria-checked attribute can be used with .toBeChecked(). Use .toHaveValue() instead`
    };
  }
  const isChecked = () => {
    if (isValidInput()) return element.checked;
    return element.getAttribute('aria-checked') === 'true';
  };
  return {
    pass: isChecked(),
    message: () => {
      const is = isChecked() ? 'is' : 'is not';
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeChecked`, 'element', ''), '', `Received element ${is} checked:`, `  ${this.utils.printReceived(element.cloneNode(false))}`].join('\n');
    }
  };
}
function supportedRolesSentence() {
  return (0, _utils.toSentence)(supportedRoles().map(role => `role="${role}"`), {
    lastWordConnector: ' or '
  });
}
function supportedRoles() {
  return _ariaQuery.roles.keys().filter(roleSupportsChecked);
}
function roleSupportsChecked(role) {
  var _roles$get;
  return ((_roles$get = _ariaQuery.roles.get(role)) == null ? void 0 : _roles$get.props['aria-checked']) !== undefined;
}