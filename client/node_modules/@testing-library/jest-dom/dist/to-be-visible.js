"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toBeVisible = toBeVisible;
var _utils = require("./utils");
function isStyleVisible(element) {
  const {
    getComputedStyle
  } = element.ownerDocument.defaultView;
  const {
    display,
    visibility,
    opacity
  } = getComputedStyle(element);
  return display !== 'none' && visibility !== 'hidden' && visibility !== 'collapse' && opacity !== '0' && opacity !== 0;
}
function isAttributeVisible(element, previousElement) {
  let detailsVisibility;
  if (previousElement) {
    detailsVisibility = element.nodeName === 'DETAILS' && previousElement.nodeName !== 'SUMMARY' ? element.hasAttribute('open') : true;
  } else {
    detailsVisibility = element.nodeName === 'DETAILS' ? element.hasAttribute('open') : true;
  }
  return !element.hasAttribute('hidden') && detailsVisibility;
}
function isElementVisible(element, previousElement) {
  return isStyleVisible(element) && isAttributeVisible(element, previousElement) && (!element.parentElement || isElementVisible(element.parentElement, element));
}
function toBeVisible(element) {
  (0, _utils.checkHtmlElement)(element, toBeVisible, this);
  const isInDocument = element.ownerDocument === element.getRootNode({
    composed: true
  });
  const isVisible = isInDocument && isElementVisible(element);
  return {
    pass: isVisible,
    message: () => {
      const is = isVisible ? 'is' : 'is not';
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toBeVisible`, 'element', ''), '', `Received element ${is} visible${isInDocument ? '' : ' (element is not in the document)'}:`, `  ${this.utils.printReceived(element.cloneNode(false))}`].join('\n');
    }
  };
}