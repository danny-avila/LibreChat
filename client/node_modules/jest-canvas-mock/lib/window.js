"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Path2D = _interopRequireDefault(require("./classes/Path2D"));
var _CanvasGradient = _interopRequireDefault(require("./classes/CanvasGradient"));
var _CanvasPattern = _interopRequireDefault(require("./classes/CanvasPattern"));
var _CanvasRenderingContext2D = _interopRequireDefault(require("./classes/CanvasRenderingContext2D"));
var _DOMMatrix = _interopRequireDefault(require("./classes/DOMMatrix"));
var _ImageData = _interopRequireDefault(require("./classes/ImageData"));
var _TextMetrics = _interopRequireDefault(require("./classes/TextMetrics"));
var _ImageBitmap = _interopRequireDefault(require("./classes/ImageBitmap"));
var _prototype = _interopRequireDefault(require("./mock/prototype"));
var _createImageBitmap = _interopRequireDefault(require("./mock/createImageBitmap"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
/**
 * Created by hustcc 17/12/25.
 * Contract: i@hust.cc
 */
var _default = win => {
  const d = win.document;
  const f = win.document.createElement;

  // jsdom@11.6.2 || jest@^22.0.0, console.error in Function getContext();
  // https://github.com/jsdom/jsdom/blob/4c7698f760fc64f20b2a0ddff450eddbdd193176/lib/jsdom/living/nodes/HTMLCanvasElement-impl.js#L55-L58
  // console.error will make ci error.
  // try {
  //   // get the context 2d.
  //   const ctx = d.createElement('canvas').getContext('2d');
  //
  //   // if canvas and context2d all exist, means mock is not needed.
  //   if (ctx) {
  //     console.warn('Context 2d of canvas is exist! No need to mock');
  //     return win;
  //   }
  // } catch (_) {
  //   // catch the throw `Error: Not implemented: HTMLCanvasElement.prototype.getContext`
  //   // https://github.com/jsdom/jsdom/blob/4c7698f760fc64f20b2a0ddff450eddbdd193176/lib/jsdom/living/nodes/HTMLCanvasElement-impl.js
  //   // when throw error, means mock is needed.
  //   // code continue
  // }
  // if ctx not exist, mock it.
  // just mock canvas creator.
  /*
  win.document.createElement = param => param.toString().toLowerCase() === 'canvas'
    ? createCanvas('canvas')
    : f.call(d, param);
  */
  // if not exist, then mock it.
  if (!win.Path2D) win.Path2D = _Path2D.default;
  if (!win.CanvasGradient) win.CanvasGradient = _CanvasGradient.default;
  if (!win.CanvasPattern) win.CanvasPattern = _CanvasPattern.default;
  if (!win.CanvasRenderingContext2D) win.CanvasRenderingContext2D = _CanvasRenderingContext2D.default;
  if (!win.DOMMatrix) win.DOMMatrix = _DOMMatrix.default;
  if (!win.ImageData) win.ImageData = _ImageData.default;
  if (!win.TextMetrics) win.TextMetrics = _TextMetrics.default;
  if (!win.ImageBitmap) win.ImageBitmap = _ImageBitmap.default;
  if (!win.createImageBitmap) win.createImageBitmap = _createImageBitmap.default;
  (0, _prototype.default)(win);
  return win;
};
exports.default = _default;