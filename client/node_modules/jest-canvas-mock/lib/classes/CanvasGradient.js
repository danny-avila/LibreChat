"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _mooColor = require("moo-color");
class CanvasGradient {
  constructor() {
    this.addColorStop = jest.fn(this.addColorStop.bind(this));
  }
  addColorStop(offset, color) {
    const numoffset = Number(offset);
    if (!Number.isFinite(numoffset) || numoffset < 0 || numoffset > 1) {
      throw new DOMException("Failed to execute 'addColorStop' on 'CanvasGradient': The provided value ('" + numoffset + "') is outside the range (0.0, 1.0)", 'IndexSizeError');
    }
    try {
      new _mooColor.MooColor(color);
    } catch (e) {
      throw new SyntaxError("Failed to execute 'addColorStop' on 'CanvasGradient': The value provided ('" + color + "') could not be parsed as a color.");
    }
  }
}
exports.default = CanvasGradient;