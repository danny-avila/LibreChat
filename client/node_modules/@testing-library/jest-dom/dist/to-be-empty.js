"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBeEmpty = toBeEmpty;
var _utils = require("./utils");
function toBeEmpty(element) {
  (0, _utils.deprecate)('toBeEmpty', 'Please use instead toBeEmptyDOMElement for finding empty nodes in the DOM.');
  (0, _utils.checkHtmlElement)(element, toBeEmpty, this);
  return {
    pass: element.innerHTML === '',
    message: () => {
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeEmpty`, 'element', ''), '', 'Received:', `  ${this.utils.printReceived(element.innerHTML)}`].join('\n');
    }
  };
}