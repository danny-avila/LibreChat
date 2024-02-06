"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveAccessibleErrorMessage = toHaveAccessibleErrorMessage;
var _utils = require("./utils");
const ariaInvalidName = 'aria-invalid';
const validStates = ['false'];

// See `aria-errormessage` spec at https://www.w3.org/TR/wai-aria-1.2/#aria-errormessage
function toHaveAccessibleErrorMessage(htmlElement, expectedAccessibleErrorMessage) {
  var _htmlElement$ownerDoc, _htmlElement$ownerDoc2;
  (0, _utils.checkHtmlElement)(htmlElement, toHaveAccessibleErrorMessage, this);
  const to = this.isNot ? 'not to' : 'to';
  const method = this.isNot ? '.not.toHaveAccessibleErrorMessage' : '.toHaveAccessibleErrorMessage';

  // Enforce Valid Id
  const errormessageId = htmlElement.getAttribute('aria-errormessage');
  const errormessageIdInvalid = !!errormessageId && /\s+/.test(errormessageId);
  if (errormessageIdInvalid) {
    return {
      pass: false,
      message: () => {
        return (0, _utils.getMessage)(this, this.utils.matcherHint(method, 'element'), "Expected element's `aria-errormessage` attribute to be empty or a single, valid ID", '', 'Received', `aria-errormessage="${errormessageId}"`);
      }
    };
  }

  // See `aria-invalid` spec at https://www.w3.org/TR/wai-aria-1.2/#aria-invalid
  const ariaInvalidVal = htmlElement.getAttribute(ariaInvalidName);
  const fieldValid = !htmlElement.hasAttribute(ariaInvalidName) || validStates.includes(ariaInvalidVal);

  // Enforce Valid `aria-invalid` Attribute
  if (fieldValid) {
    return {
      pass: false,
      message: () => {
        return (0, _utils.getMessage)(this, this.utils.matcherHint(method, 'element'), 'Expected element to be marked as invalid with attribute', `${ariaInvalidName}="${String(true)}"`, 'Received', htmlElement.hasAttribute('aria-invalid') ? `${ariaInvalidName}="${htmlElement.getAttribute(ariaInvalidName)}` : null);
      }
    };
  }
  const error = (0, _utils.normalize)((_htmlElement$ownerDoc = (_htmlElement$ownerDoc2 = htmlElement.ownerDocument.getElementById(errormessageId)) == null ? void 0 : _htmlElement$ownerDoc2.textContent) != null ? _htmlElement$ownerDoc : '');
  return {
    pass: expectedAccessibleErrorMessage === undefined ? Boolean(error) : expectedAccessibleErrorMessage instanceof RegExp ? expectedAccessibleErrorMessage.test(error) : this.equals(error, expectedAccessibleErrorMessage),
    message: () => {
      return (0, _utils.getMessage)(this, this.utils.matcherHint(method, 'element'), `Expected element ${to} have accessible error message`, expectedAccessibleErrorMessage != null ? expectedAccessibleErrorMessage : '', 'Received', error);
    }
  };
}