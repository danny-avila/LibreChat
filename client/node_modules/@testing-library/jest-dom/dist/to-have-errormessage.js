"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveErrorMessage = toHaveErrorMessage;
var _utils = require("./utils");
// See aria-errormessage spec https://www.w3.org/TR/wai-aria-1.2/#aria-errormessage
function toHaveErrorMessage(htmlElement, checkWith) {
  (0, _utils.deprecate)('toHaveErrorMessage', 'Please use toHaveAccessibleErrorMessage.');
  (0, _utils.checkHtmlElement)(htmlElement, toHaveErrorMessage, this);
  if (!htmlElement.hasAttribute('aria-invalid') || htmlElement.getAttribute('aria-invalid') === 'false') {
    const not = this.isNot ? '.not' : '';
    return {
      pass: false,
      message: () => {
        return (0, _utils.getMessage)(this, this.utils.matcherHint(`${not}.toHaveErrorMessage`, 'element', ''), `Expected the element to have invalid state indicated by`, 'aria-invalid="true"', 'Received', htmlElement.hasAttribute('aria-invalid') ? `aria-invalid="${htmlElement.getAttribute('aria-invalid')}"` : this.utils.printReceived(''));
      }
    };
  }
  const expectsErrorMessage = checkWith !== undefined;
  const errormessageIDRaw = htmlElement.getAttribute('aria-errormessage') || '';
  const errormessageIDs = errormessageIDRaw.split(/\s+/).filter(Boolean);
  let errormessage = '';
  if (errormessageIDs.length > 0) {
    const document = htmlElement.ownerDocument;
    const errormessageEls = errormessageIDs.map(errormessageID => document.getElementById(errormessageID)).filter(Boolean);
    errormessage = (0, _utils.normalize)(errormessageEls.map(el => el.textContent).join(' '));
  }
  return {
    pass: expectsErrorMessage ? checkWith instanceof RegExp ? checkWith.test(errormessage) : this.equals(errormessage, checkWith) : Boolean(errormessage),
    message: () => {
      const to = this.isNot ? 'not to' : 'to';
      return (0, _utils.getMessage)(this, this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toHaveErrorMessage`, 'element', ''), `Expected the element ${to} have error message`, this.utils.printExpected(checkWith), 'Received', this.utils.printReceived(errormessage));
    }
  };
}