"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBeEmptyDOMElement = toBeEmptyDOMElement;
var _utils = require("./utils");
function toBeEmptyDOMElement(element) {
  (0, _utils.checkHtmlElement)(element, toBeEmptyDOMElement, this);
  return {
    pass: isEmptyElement(element),
    message: () => {
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeEmptyDOMElement`, 'element', ''), '', 'Received:', `  ${this.utils.printReceived(element.innerHTML)}`].join('\n');
    }
  };
}

/**
 * Identifies if an element doesn't contain child nodes (excluding comments)
 * ℹ Node.COMMENT_NODE can't be used because of the following issue 
 * https://github.com/jsdom/jsdom/issues/2220
 *
 * @param {*} element an HtmlElement or SVGElement
 * @return {*} true if the element only contains comments or none
 */
function isEmptyElement(element) {
  const nonCommentChildNodes = [...element.childNodes].filter(node => node.nodeType !== 8);
  return nonCommentChildNodes.length === 0;
}