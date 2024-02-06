"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
class CanvasPattern {
  constructor() {
    this.setTransform = jest.fn(this.setTransform.bind(this));
  }
  setTransform(value) {
    if (arguments.length > 0 && !(value instanceof Object)) throw new TypeError("Failed to execute 'setTransform' on 'CanvasPattern': parameter 1 ('transform') is not an object.");
  }
}
exports.default = CanvasPattern;