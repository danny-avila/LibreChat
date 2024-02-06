"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toContainElement = toContainElement;
var _utils = require("./utils");
function toContainElement(container, element) {
  (0, _utils.checkHtmlElement)(container, toContainElement, this);
  if (element !== null) {
    (0, _utils.checkHtmlElement)(element, toContainElement, this);
  }
  return {
    pass: container.contains(element),
    message: () => {
      return [this.utils.matcherHint(`${this.isNot ? '.not' : ''}.toContainElement`, 'element', 'element'), '',
      // eslint-disable-next-line @babel/new-cap
      this.utils.RECEIVED_COLOR(`${this.utils.stringify(container.cloneNode(false))} ${this.isNot ? 'contains:' : 'does not contain:'} ${this.utils.stringify(element ? element.cloneNode(false) : element)}
        `)].join('\n');
    }
  };
}