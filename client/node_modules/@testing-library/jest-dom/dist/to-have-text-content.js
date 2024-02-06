"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveTextContent = toHaveTextContent;
var _utils = require("./utils");
function toHaveTextContent(node, checkWith, options = {
  normalizeWhitespace: true
}) {
  (0, _utils.checkNode)(node, toHaveTextContent, this);
  const textContent = options.normalizeWhitespace ? (0, _utils.normalize)(node.textContent) : node.textContent.replace(/\u00a0/g, ' '); // Replace &nbsp; with normal spaces

  const checkingWithEmptyString = textContent !== '' && checkWith === '';
  return {
    pass: !checkingWithEmptyString && (0, _utils.matches)(textContent, checkWith),
    message: () => {
      const to = this.isNot ? 'not to' : 'to';
      return (0, _utils.getMessage)(this, this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toHaveTextContent`, 'element', ''), checkingWithEmptyString ? `Checking with empty string will always match, use .toBeEmptyDOMElement() instead` : `Expected element ${to} have text content`, checkWith, 'Received', textContent);
    }
  };
}