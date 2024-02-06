"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
class ImageData {
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  get data() {
    return this._data;
  }
  constructor(arr, w, h) {
    _defineProperty(this, "_width", 0);
    _defineProperty(this, "_height", 0);
    _defineProperty(this, "_data", null);
    if (arguments.length === 2) {
      if (arr instanceof Uint8ClampedArray) {
        if (arr.length === 0) throw new RangeError('Source length must be a positive multiple of 4.');
        if (arr.length % 4 !== 0) throw new RangeError('Source length must be a positive multiple of 4.');
        if (!Number.isFinite(w)) throw new RangeError('The width is zero or not a number.');
        if (w === 0) throw new RangeError('The width is zero or not a number.');
        this._width = w;
        this._height = arr.length / 4 / w;
        this._data = arr;
      } else {
        const width = arr;
        const height = w;
        if (!Number.isFinite(height)) throw new RangeError('The height is zero or not a number.');
        if (height === 0) throw new RangeError('The height is zero or not a number.');
        if (!Number.isFinite(width)) throw new RangeError('The width is zero or not a number.');
        if (width === 0) throw new RangeError('The width is zero or not a number.');
        this._width = width;
        this._height = height;
        this._data = new Uint8ClampedArray(width * height * 4);
      }
    } else if (arguments.length === 3) {
      if (!(arr instanceof Uint8ClampedArray)) throw new TypeError('First argument must be a Uint8ClampedArray when using 3 arguments.');
      if (arr.length === 0) throw new RangeError('Source length must be a positive multiple of 4.');
      if (arr.length % 4 !== 0) throw new RangeError('Source length must be a positive multiple of 4.');
      if (!Number.isFinite(h)) throw new RangeError('The height is zero or not a number.');
      if (h === 0) throw new RangeError('The height is zero or not a number.');
      if (!Number.isFinite(w)) throw new RangeError('The width is zero or not a number.');
      if (w === 0) throw new RangeError('The width is zero or not a number.');
      if (arr.length !== w * h * 4) throw new RangeError("Source doesn'n contain the exact number of pixels needed.");
      this._width = w;
      this._height = h;
      this._data = arr;
    } else {
      throw new TypeError('Wrong number of arguments provided.');
    }
  }
}
exports.default = ImageData;