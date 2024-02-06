"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
class TextMetrics {
  constructor(text) {
    _defineProperty(this, "width", 0);
    _defineProperty(this, "actualBoundingBoxLeft", 0);
    _defineProperty(this, "actualBoundingBoxRight", 0);
    _defineProperty(this, "fontBoundingBoxAscent", 0);
    _defineProperty(this, "fontBoundingBoxDescent", 0);
    _defineProperty(this, "actualBoundingBoxAscent", 0);
    _defineProperty(this, "actualBoundingBoxDescent", 0);
    _defineProperty(this, "emHeightAscent", 0);
    _defineProperty(this, "emHeightDescent", 0);
    _defineProperty(this, "hangingBaseline", 0);
    _defineProperty(this, "alphabeticBaseline", 0);
    _defineProperty(this, "ideographicBaseline", 0);
    this.width = text.length;
  }
}
exports.default = TextMetrics;