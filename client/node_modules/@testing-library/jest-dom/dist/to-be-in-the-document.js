"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBeInTheDocument = toBeInTheDocument;
var _utils = require("./utils");
function toBeInTheDocument(element) {
  if (element !== null || !this.isNot) {
    (0, _utils.checkHtmlElement)(element, toBeInTheDocument, this);
  }
  const pass = element === null ? false : element.ownerDocument === element.getRootNode({
    composed: true
  });
  const errorFound = () => {
    return `expected document not to contain element, found ${this.utils.stringify(element.cloneNode(true))} instead`;
  };
  const errorNotFound = () => {
    return `element could not be found in the document`;
  };
  return {
    pass,
    message: () => {
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeInTheDocument`, 'element', ''), '',
      // eslint-disable-next-line @babel/new-cap
      this.utils.RECEIVED_COLOR(this.isNot ? errorFound() : errorNotFound())].join('\n');
    }
  };
}