"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBeInTheDOM = toBeInTheDOM;
var _utils = require("./utils");
function toBeInTheDOM(element, container) {
  (0, _utils.deprecate)('toBeInTheDOM', 'Please use toBeInTheDocument for searching the entire document and toContainElement for searching a specific container.');
  if (element) {
    (0, _utils.checkHtmlElement)(element, toBeInTheDOM, this);
  }
  if (container) {
    (0, _utils.checkHtmlElement)(container, toBeInTheDOM, this);
  }
  return {
    pass: container ? container.contains(element) : !!element,
    message: () => {
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeInTheDOM`, 'element', ''), '', 'Received:', `  ${this.utils.printReceived(element ? element.cloneNode(false) : element)}`].join('\n');
    }
  };
}