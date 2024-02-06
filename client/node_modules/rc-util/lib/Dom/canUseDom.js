"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = canUseDom;
function canUseDom() {
  return !!(typeof window !== 'undefined' && window.document && window.document.createElement);
}