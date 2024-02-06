"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _CanvasRenderingContext2D = _interopRequireDefault(require("./CanvasRenderingContext2D"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
// Path2D.prototype
const Path2DFunc = ['addPath'];
const borrowedFromCanvas = ['closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect'];
class Path2D {
  constructor() {
    _defineProperty(this, "_path", []);
    _defineProperty(this, "_events", []);
    _defineProperty(this, "_stackIndex", 0);
    _defineProperty(this, "_transformStack", [[1, 0, 0, 1, 0, 0]]);
    borrowedFromCanvas.forEach(key => {
      this[key] = jest.fn(_CanvasRenderingContext2D.default.prototype[key].bind(this));
    });
    Path2DFunc.forEach(key => {
      this[key] = jest.fn(this[key].bind(this));
    });
  }
  addPath(path) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'addPath' on 'Path2D': 1 argument required, but only 0 present.");
    if (!(path instanceof Path2D)) throw new TypeError("Failed to execute 'addPath' on 'Path2D': parameter 1 is not of type 'Path2D'.");
    for (let i = 0; i < path._path.length; i++) this._path.push(path._path[i]);
  }
}
exports.default = Path2D;