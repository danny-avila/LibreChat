"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _DOMMatrix = _interopRequireDefault(require("./DOMMatrix"));
var _CanvasPattern = _interopRequireDefault(require("./CanvasPattern"));
var _cssfontparser = _interopRequireDefault(require("cssfontparser"));
var _TextMetrics = _interopRequireDefault(require("./TextMetrics"));
var _createCanvasEvent = _interopRequireDefault(require("../mock/createCanvasEvent"));
var _Path2D = _interopRequireDefault(require("./Path2D"));
var _mooColor = require("moo-color");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const testFuncs = ['setLineDash', 'getLineDash', 'setTransform', 'getTransform', 'getImageData', 'save', 'restore', 'createPattern', 'createRadialGradient', 'addHitRegion', 'arc', 'arcTo', 'beginPath', 'clip', 'closePath', 'scale', 'stroke', 'clearHitRegions', 'clearRect', 'fillRect', 'strokeRect', 'rect', 'resetTransform', 'translate', 'moveTo', 'lineTo', 'bezierCurveTo', 'createLinearGradient', 'ellipse', 'measureText', 'rotate', 'drawImage', 'drawFocusIfNeeded', 'isPointInPath', 'isPointInStroke', 'putImageData', 'strokeText', 'fillText', 'quadraticCurveTo', 'removeHitRegion', 'fill', 'transform', 'scrollPathIntoView', 'createImageData'];
const compositeOperations = ['source-over', 'source-in', 'source-out', 'source-atop', 'destination-over', 'destination-in', 'destination-out', 'destination-atop', 'lighter', 'copy', 'xor', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
function getTransformSlice(ctx) {
  return ctx._transformStack[ctx._stackIndex].slice();
}

/**
 * Returns the string serialization of a CSS color, according to https://www.w3.org/TR/2dcontext/#serialization-of-a-color
 */
function serializeColor(value) {
  return value.getAlpha() === 1 ? value.toHex() : value.toRgb();
}
class CanvasRenderingContext2D {
  __getDrawCalls() {
    return this._drawCalls.slice();
  }

  /**
   * Clear the list of draw calls
   */
  __clearDrawCalls() {
    this._drawCalls = [];
  }

  /**
   * Every time a function call results in something that would have modified the state of the context,
   * an event is added to this array. This goes for every property set, and draw call.
   */

  __getEvents() {
    return this._events.slice();
  }

  /**
   * Clear the list of events
   */
  __clearEvents() {
    this._events = [];
  }

  /**
   * This array keeps track of the current path, so that fill and stroke operations can store the
   * path.
   */

  __getPath() {
    return this._path.slice();
  }

  /**
   * Clear the path and reset it to a single beginPath event.
   */
  __clearPath() {
    const event = (0, _createCanvasEvent.default)('beginPath', getTransformSlice(this), {});
    // The clipping path should start after the initial beginPath instruction
    this._clipIndex = 1;
    this._path = [event];
  }

  /**
   * Get the current clipping region.
   */
  __getClippingRegion() {
    return this._clipStack[this._stackIndex];
  }
  constructor(canvas) {
    /**
     * Every time a function call would result in a drawing operation, it should be added to this array.
     * This goes for only draw call functions.
     */
    _defineProperty(this, "_drawCalls", []);
    _defineProperty(this, "_events", []);
    _defineProperty(this, "_path", [(0, _createCanvasEvent.default)('beginPath', [1, 0, 0, 1, 0, 0], {})]);
    _defineProperty(this, "_directionStack", ['inherit']);
    _defineProperty(this, "_fillStyleStack", ['#000000']);
    _defineProperty(this, "_filterStack", ['none']);
    _defineProperty(this, "_fontStack", ['10px sans-serif']);
    _defineProperty(this, "_globalAlphaStack", [1.0]);
    _defineProperty(this, "_globalCompositeOperationStack", ['source-over']);
    _defineProperty(this, "_imageSmoothingEnabledStack", [true]);
    _defineProperty(this, "_imageSmoothingQualityStack", ['low']);
    _defineProperty(this, "_lineCapStack", ['butt']);
    _defineProperty(this, "_lineDashOffsetStack", [0]);
    _defineProperty(this, "_lineDashStack", [[]]);
    _defineProperty(this, "_lineJoinStack", ['miter']);
    _defineProperty(this, "_lineWidthStack", [1]);
    _defineProperty(this, "_miterLimitStack", [10]);
    _defineProperty(this, "_shadowBlurStack", [0]);
    _defineProperty(this, "_shadowColorStack", ['rgba(0, 0, 0, 0)']);
    _defineProperty(this, "_shadowOffsetXStack", [0]);
    _defineProperty(this, "_shadowOffsetYStack", [0]);
    _defineProperty(this, "_stackIndex", 0);
    _defineProperty(this, "_strokeStyleStack", ['#000000']);
    _defineProperty(this, "_textAlignStack", ['start']);
    _defineProperty(this, "_textBaselineStack", ['alphabetic']);
    _defineProperty(this, "_transformStack", [[1, 0, 0, 1, 0, 0]]);
    _defineProperty(this, "_clipStack", [[]]);
    /**
     * This index points to the next path item that should be written to the clipStack
     * when ctx.clip() is called.
     */
    _defineProperty(this, "_clipIndex", 1);
    testFuncs.forEach(key => {
      this[key] = jest.fn(CanvasRenderingContext2D.prototype[key].bind(this));
    });
    this._canvas = canvas;
  }
  addHitRegion(options = {}) {
    const {
      path,
      fillRule,
      id,
      parentID,
      cursor,
      control,
      label,
      role
    } = options;
    if (!path && !id) throw new DOMException("Failed to execute 'addHitRegion' on '" + this.constructor.name + "': Both id and control are null.", 'ConstraintError');
    if (fillRule && fillRule !== 'evenodd' && fillRule !== 'nonzero') throw new TypeError("Failed to execute 'addHitRegion' on '" + this.constructor.name + "': The provided value '" + fillRule + "' is not a valid enum value of type CanvasFillRule.");
    this._events.push((0, _createCanvasEvent.default)('addHitRegion', getTransformSlice(this), {
      path,
      fillRule,
      id,
      parentID,
      cursor,
      control,
      label,
      role
    }));
  }
  arc(x, y, radius, startAngle, endAngle, anticlockwise = false) {
    if (arguments.length < 5) throw new TypeError("Failed to execute 'arc' on '" + this.constructor.name + "': 5 arguments required, but only " + arguments.length + ' present.');
    const xResult = Number(x);
    const yResult = Number(y);
    const radiusResult = Number(radius);
    const startAngleResult = Number(startAngle);
    const endAngleResult = Number(endAngle);
    const anticlockwiseResult = Boolean(anticlockwise);

    // quick is finite check
    if (!Number.isFinite(xResult + yResult + radiusResult + startAngleResult + endAngleResult)) return;
    if (Number(radius) < 0) throw new DOMException("Failed to execute 'arc' on '" + this.constructor.name + "': The radius provided (" + radius + ') is negative.', 'IndexSizeError');
    const event = (0, _createCanvasEvent.default)('arc', getTransformSlice(this), {
      x: xResult,
      y: yResult,
      radius: radiusResult,
      startAngle: startAngleResult,
      endAngle: endAngleResult,
      anticlockwise: anticlockwiseResult
    });
    this._path.push(event);
    this._events.push(event);
  }
  arcTo(cpx1, cpy1, cpx2, cpy2, radius) {
    if (arguments.length < 5) throw new TypeError("Failed to execute 'arcTo' on '" + this.constructor.name + "': 5 arguments required, but only " + arguments.length + ' present.');
    const cpx1Result = Number(cpx1);
    const cpy1Result = Number(cpy1);
    const cpx2Result = Number(cpx2);
    const cpy2Result = Number(cpy2);
    const radiusResult = Number(radius);
    if (!Number.isFinite(cpx1Result + cpx2Result + cpy1Result + cpy2Result + radiusResult)) return;
    if (radiusResult < 0) throw new DOMException("Failed to execute 'arcTo' on '" + this.constructor.name + "': The radius provided (" + radius + ') is negative.', 'IndexSizeError');
    const event = (0, _createCanvasEvent.default)('arcTo', getTransformSlice(this), {
      cpx1: cpx1Result,
      cpy1: cpy1Result,
      cpx2: cpx2Result,
      cpy2: cpy2Result,
      radius: radiusResult
    });
    this._path.push(event);
    this._events.push(event);
  }
  beginPath() {
    this.__clearPath();
    // push the generated beginPath to the event list
    this._events.push(this._path[0]);
  }
  bezierCurveTo(cpx1, cpy1, cpx2, cpy2, x, y) {
    if (arguments.length < 6) throw new TypeError("Failed to execute 'bezierCurveTo' on '" + this.constructor.name + "': 6 arguments required, but only " + arguments.length + ' present.');
    const cpx1Result = Number(cpx1);
    const cpy1Result = Number(cpy1);
    const cpx2Result = Number(cpx2);
    const cpy2Result = Number(cpy2);
    const xResult = Number(x);
    const yResult = Number(y);
    if (!Number.isFinite(cpx1Result + cpy1Result + cpx2Result + cpy2Result + xResult + yResult)) return;
    const event = (0, _createCanvasEvent.default)('bezierCurveTo', getTransformSlice(this), {
      cpx1,
      cpy1,
      cpx2,
      cpy2,
      x,
      y
    });
    this._path.push(event);
    this._events.push(event);
  }
  get canvas() {
    return this._canvas;
  }
  clearHitRegions() {
    const event = (0, _createCanvasEvent.default)('clearHitRegions', getTransformSlice(this), {});
    this._events.push(event);
  }
  clearRect(x, y, width, height) {
    if (arguments.length < 4) throw new TypeError("Failed to execute 'clearRect' on '" + this.constructor.name + "': 4 arguments required, but only " + arguments.length + ' present.');
    const xResult = Number(x);
    const yResult = Number(y);
    const widthResult = Number(width);
    const heightResult = Number(height);
    if (!Number.isFinite(x + y + width + height)) return;
    const event = (0, _createCanvasEvent.default)('clearRect', getTransformSlice(this), {
      x: xResult,
      y: yResult,
      width: widthResult,
      height: heightResult
    });
    this._events.push(event);
    this._drawCalls.push(event);
  }
  clip(path, fillRule) {
    let clipPath;
    if (arguments.length === 0) {
      fillRule = 'nonzero';
      path = this._path.slice();
      clipPath = path.slice(this._clipIndex);
      this._clipIndex = path.length;
    } else {
      if (arguments.length === 1) fillRule = 'nonzero';
      if (path instanceof _Path2D.default) {
        fillRule = String(fillRule);
        if (fillRule !== 'nonzero' && fillRule !== 'evenodd') throw new TypeError("Failed to execute 'clip' on '" + this.constructor.name + "': The provided value '" + fillRule + "' is not a valid enum value of type CanvasFillRule.");
        path = path._path.slice();
        clipPath = path;
      } else {
        fillRule = String(path);
        if (fillRule !== 'nonzero' && fillRule !== 'evenodd') throw new TypeError("Failed to execute 'clip' on '" + this.constructor.name + "': The provided value '" + fillRule + "' is not a valid enum value of type CanvasFillRule.");
        path = this._path.slice();
        clipPath = path.slice(this._clipIndex);
        this._clipIndex = path.length;
      }
    }
    const event = (0, _createCanvasEvent.default)('clip', getTransformSlice(this), {
      path,
      fillRule
    });
    this._path.push(event);
    this._events.push(event);
    const currentClip = this._clipStack[this._stackIndex];
    this._clipStack[this._stackIndex] = currentClip.concat(clipPath);
  }
  closePath() {
    const event = (0, _createCanvasEvent.default)('closePath', getTransformSlice(this), {});
    this._events.push(event);
    this._path.push(event);
  }
  createImageData(width, height) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'createImageData' on '" + this.constructor.name + "': 1 argument required, but only 0 present.");else if (arguments.length === 1) {
      if (!(width instanceof ImageData)) throw new TypeError("Failed to execute 'createImageData' on '" + this.constructor.name + "': parameter 1 is not of type 'ImageData'.");
      let result = new ImageData(width.width, width.height);
      result.data.set(width.data);
      const event = (0, _createCanvasEvent.default)('createImageData', getTransformSlice(this), {
        width: width.width,
        height: width.height
      });
      this._events.push(event);
      return result;
    } else {
      width = Math.abs(Number(width));
      height = Math.abs(Number(height));
      if (!Number.isFinite(width) || width === 0) throw new TypeError("Failed to execute 'createImageData' on '" + this.constructor.name + "': The source width is 0.");
      if (!Number.isFinite(height) || height === 0) throw new TypeError("Failed to execute 'createImageData' on '" + this.constructor.name + "': The source height is 0.");
      const event = (0, _createCanvasEvent.default)('createImageData', getTransformSlice(this), {
        width,
        height
      });
      this._events.push(event);
      return new ImageData(width, height);
    }
  }
  createLinearGradient(x0, y0, x1, y1) {
    if (arguments.length < 4) throw new TypeError("Failed to execute 'createLinearGradient' on '" + this.constructor.name + "': 4 arguments required, but only " + arguments.length + ' present.');
    const x0Result = Number(x0);
    const y0Result = Number(y0);
    const x1Result = Number(x1);
    const y1Result = Number(y1);
    if (!Number.isFinite(x0Result + y0Result + x1Result + y1Result)) throw new TypeError("Failed to execute 'createLinearGradient' on '" + this.constructor.name + "': The provided double value is non-finite.");
    const event = (0, _createCanvasEvent.default)('createLinearGradient', getTransformSlice(this), {
      x0: x0Result,
      y0: y0Result,
      x1: x1Result,
      y1: y1Result
    });
    this._events.push(event);
    return new CanvasGradient();
  }
  createPattern(image, type) {
    if (arguments.length === 1) throw new TypeError("Failed to execute 'createPattern' on '" + this.constructor.name + "': 2 arguments required, but only 1 present.");
    if (type === null) type = 'repeat';
    if (type === '') type = 'repeat';
    if (type === 'repeat' || type === 'repeat-x' || type === 'repeat-y' || type === 'no-repeat') {
      const event = (0, _createCanvasEvent.default)('createPattern', getTransformSlice(this), {
        image,
        type
      });
      if (image instanceof ImageBitmap) {
        if (image._closed) throw new DOMException("Failed to execute 'createPattern' on 'CanvasRenderingContext2D': The image source is detached.", 'InvalidStateError');
        this._events.push(event);
        return new _CanvasPattern.default();
      }
      if (image instanceof HTMLImageElement) {
        this._events.push(event);
        return new _CanvasPattern.default();
      }
      if (image instanceof HTMLVideoElement) {
        this._events.push(event);
        return new _CanvasPattern.default();
      }
      if (image instanceof HTMLCanvasElement) {
        this._events.push(event);
        return new _CanvasPattern.default();
      }
    } else {
      throw new TypeError("Failed to execute 'createPattern' on '" + this.constructor.name + "': The provided type ('" + type + "') is not one of 'repeat', 'no-repeat', 'repeat-x', or 'repeat-y'.");
    }
    throw new TypeError("Failed to execute 'createPattern' on '" + this.constructor.name + "': The provided value is not of type '(CSSImageValue or HTMLImageElement or SVGImageElement or HTMLVideoElement or HTMLCanvasElement or ImageBitmap or OffscreenCanvas)'");
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    if (arguments.length < 6) throw new TypeError("Failed to execute 'createRadialGradient' on '" + this.constructor.name + "': 6 arguments required, but only " + arguments.length + ' present.');
    const x0Result = Number(x0);
    const y0Result = Number(y0);
    const r0Result = Number(r0);
    const x1Result = Number(x1);
    const y1Result = Number(y1);
    const r1Result = Number(r1);
    if (!Number.isFinite(x0Result + y0Result + r0Result + x1Result + y1Result + r1Result)) throw new TypeError("Failed to execute 'createRadialGradient' on '" + this.constructor.name + "': The provided double value is non-finite.");
    if (r0Result < 0) throw new DOMException("Failed to execute 'createRadialGradient' on '" + this.constructor.name + "': The r0 provided is less than 0.", 'IndexSizeError');
    if (r1Result < 0) throw new DOMException("Failed to execute 'createRadialGradient' on '" + this.constructor.name + "': The r1 provided is less than 0.", 'IndexSizeError');
    const event = (0, _createCanvasEvent.default)('createRadialGradient', getTransformSlice(this), {
      x0: x0Result,
      y0: y0Result,
      r0: r0Result,
      x1: x1Result,
      y1: y1Result,
      r1: r1Result
    });
    this._events.push(event);
    return new CanvasGradient();
  }
  set currentTransform(value) {
    if (value instanceof _DOMMatrix.default) {
      this._transformStack[this._stackIndex][0] = value.a;
      this._transformStack[this._stackIndex][1] = value.b;
      this._transformStack[this._stackIndex][2] = value.c;
      this._transformStack[this._stackIndex][3] = value.d;
      this._transformStack[this._stackIndex][4] = value.e;
      this._transformStack[this._stackIndex][5] = value.f;
      const event = (0, _createCanvasEvent.default)('currentTransform', getTransformSlice(this), {
        a: value.a,
        b: value.b,
        c: value.c,
        d: value.d,
        e: value.e,
        f: value.f
      });
      this._events.push(event);
    }
  }
  get currentTransform() {
    return new _DOMMatrix.default(this._transformStack[this._stackIndex]);
  }
  set direction(value) {
    if (value === 'rtl' || value === 'ltr' || value === 'inherit') {
      this._directionStack[this._stackIndex] = value;
      const event = (0, _createCanvasEvent.default)('direction', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get direction() {
    return this._directionStack[this._stackIndex];
  }
  drawFocusIfNeeded(path, element) {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'drawFocusIfNeeded' on '" + this.constructor.name + "': 1 argument required, but only 0 present.");
    if (arguments.length === 2 && !(path instanceof _Path2D.default)) throw new TypeError("Failed to execute 'drawFocusIfNeeded' on '" + this.constructor.name + "': parameter 1 is not of type 'Path2D'.");
    if (arguments.length === 1) {
      element = path;
      path = null;
    }
    if (!(element instanceof Element)) throw new TypeError("Failed to execute 'drawFocusIfNeeded' on '" + this.constructor.name + "': parameter " + arguments.length + " is not of type 'Element'.");
    const event = (0, _createCanvasEvent.default)('drawFocusIfNeeded', getTransformSlice(this), {
      path: path ? path._path : null,
      element
    });
    this._events.push(event);
  }
  drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
    if (arguments.length < 3) throw new TypeError("Failed to execute 'drawImage' on '" + this.constructor.name + "': 3 arguments required, but only " + arguments.length + ' present.');
    if (arguments.length === 4 || arguments.length > 5 && arguments.length < 9) throw new TypeError("Failed to execute 'drawImage' on '" + this.constructor.name + "': Valid arities are: [3, 5, 9], but 4 arguments provided.");
    let valid = false;
    if (img instanceof HTMLImageElement) valid = true;
    if (img instanceof ImageBitmap) {
      if (img._closed) throw new DOMException("DOMException: Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The image source is detached.", 'InvalidStateError');
      valid = true;
    }
    if (img instanceof HTMLVideoElement) valid = true;
    if (img instanceof HTMLCanvasElement) valid = true;
    if (!valid) throw new TypeError("Failed to execute 'drawImage' on '" + this.constructor.name + "': The provided value is not of type '(CSSImageValue or HTMLImageElement or SVGImageElement or HTMLVideoElement or HTMLCanvasElement or ImageBitmap or OffscreenCanvas)'");
    const sxResult = Number(sx);
    const syResult = Number(sy);
    const sWidthResult = Number(sWidth);
    const sHeightResult = Number(sHeight);
    const dxResult = Number(dx);
    const dyResult = Number(dy);
    const dWidthResult = Number(dWidth);
    const dHeightResult = Number(dHeight);
    if (arguments.length === 3) {
      if (!Number.isFinite(sxResult + syResult)) return;
      sx = 0;
      sy = 0;
      sWidth = img.width;
      sHeight = img.height;
      dx = sxResult;
      dy = syResult;
      dWidth = img.width;
      dHeight = img.height;
    } else if (arguments.length === 5) {
      if (!Number.isFinite(sxResult + syResult + sWidthResult + sHeightResult)) return;
      sx = 0;
      sy = 0;
      sWidth = img.width;
      sHeight = img.height;
      dx = sxResult;
      dy = syResult;
      dWidth = sWidth;
      dHeight = sHeight;
    } else {
      if (!Number.isFinite(sx + sy + sWidth + sHeight + dx + dy + dWidth + dHeight)) return;
      sx = sxResult;
      sy = syResult;
      sWidth = sWidthResult;
      sHeight = sHeightResult;
      dx = dxResult;
      dy = dyResult;
      dWidth = dWidthResult;
      dHeight = dHeightResult;
    }
    const event = (0, _createCanvasEvent.default)('drawImage', getTransformSlice(this), {
      img,
      sx,
      sy,
      sWidth,
      sHeight,
      dx,
      dy,
      dWidth,
      dHeight
    });
    this._events.push(event);
    this._drawCalls.push(event);
  }
  ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise = false) {
    if (arguments.length < 7) throw new TypeError("Failed to execute 'ellipse' on '" + this.constructor.name + "': 6 arguments required, but only " + arguments.length + ' present.');
    const xResult = Number(x);
    const yResult = Number(y);
    const radiusXResult = Number(radiusX);
    const radiusYResult = Number(radiusY);
    const rotationResult = Number(rotation);
    const startAngleResult = Number(startAngle);
    const endAngleResult = Number(endAngle);
    const anticlockwiseResult = Boolean(anticlockwise);
    if (!Number.isFinite(xResult + yResult + radiusXResult + radiusYResult + rotationResult + startAngleResult + endAngleResult)) return;
    if (Number(radiusX) < 0) throw new DOMException("Failed to execute 'ellipse' on '" + this.constructor.name + "': The major-axis radius provided (" + radiusX + ') is negative.', 'IndexSizeError');
    if (Number(radiusY) < 0) throw new DOMException("Failed to execute 'ellipse' on '" + this.constructor.name + "': The minor-axis radius provided (" + radiusY + ') is negative.', 'IndexSizeError');
    const event = (0, _createCanvasEvent.default)('ellipse', getTransformSlice(this), {
      x: xResult,
      y: yResult,
      radiusX: radiusXResult,
      radiusY: radiusYResult,
      rotation: rotationResult,
      startAngle: startAngleResult,
      endAngle: endAngleResult,
      anticlockwise: anticlockwiseResult
    });
    this._path.push(event);
    this._events.push(event);
  }
  fill(path, fillRule) {
    if (arguments.length === 0) {
      fillRule = 'nonzero';
      path = this._path.slice();
    } else {
      if (arguments.length === 1) fillRule = 'nonzero';
      if (path instanceof _Path2D.default) {
        fillRule = String(fillRule);
        if (fillRule !== 'nonzero' && fillRule !== 'evenodd') throw new TypeError("Failed to execute 'clip' on '" + this.constructor.name + "': The provided value '" + fillRule + "' is not a valid enum value of type CanvasFillRule.");
        path = path._path.slice();
      } else {
        fillRule = String(path);
        if (fillRule !== 'nonzero' && fillRule !== 'evenodd') throw new TypeError("Failed to execute 'clip' on '" + this.constructor.name + "': The provided value '" + fillRule + "' is not a valid enum value of type CanvasFillRule.");
        path = this._path.slice();
      }
    }
    const event = (0, _createCanvasEvent.default)('fill', getTransformSlice(this), {
      path,
      fillRule
    });
    this._events.push(event);
    this._drawCalls.push(event);
  }
  fillRect(x, y, width, height) {
    if (arguments.length < 4) throw new TypeError("Failed to execute 'fillRect' on '" + this.constructor.name + "': 4 arguments required, but only " + arguments.length + ' present.');
    const xResult = Number(x);
    const yResult = Number(y);
    const widthResult = Number(width);
    const heightResult = Number(height);
    if (!Number.isFinite(x + y + width + height)) return;
    const event = (0, _createCanvasEvent.default)('fillRect', getTransformSlice(this), {
      x: xResult,
      y: yResult,
      width: widthResult,
      height: heightResult
    });
    this._events.push(event);
    this._drawCalls.push(event);
  }
  set fillStyle(value) {
    let valid = false;
    if (typeof value === 'string') {
      try {
        const result = new _mooColor.MooColor(value);
        valid = true;
        value = this._fillStyleStack[this._stackIndex] = serializeColor(result);
      } catch (e) {
        return;
      }
    } else if (value instanceof CanvasGradient || value instanceof _CanvasPattern.default) {
      valid = true;
      this._fillStyleStack[this._stackIndex] = value;
    }
    if (valid) {
      const event = (0, _createCanvasEvent.default)('fillStyle', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get fillStyle() {
    return this._fillStyleStack[this._stackIndex];
  }
  fillText(text, x, y, maxWidth) {
    if (arguments.length < 3) throw new TypeError("Failed to execute 'fillText' on '" + this.constructor.name + "': 3 arguments required, but only " + arguments.length + ' present.');
    const textResult = String(text);
    const xResult = Number(x);
    const yResult = Number(y);
    const maxWidthResult = Number(maxWidth);
    if (arguments.length === 3 && !Number.isFinite(xResult + yResult)) return;
    if (arguments.length > 3 && !Number.isFinite(xResult + yResult + maxWidthResult)) return;
    const event = (0, _createCanvasEvent.default)('fillText', getTransformSlice(this), {
      text: textResult,
      x: xResult,
      y: yResult,
      maxWidth: arguments.length === 3 ? null : maxWidthResult
    });
    this._events.push(event);
    this._drawCalls.push(event);
  }
  set filter(value) {
    if (value === '') value = 'none';
    value = this._filterStack[this._stackIndex] = typeof value === 'string' ? value : 'none';
    const event = (0, _createCanvasEvent.default)('filter', getTransformSlice(this), {
      value
    });
    this._events.push(event);
  }
  get filter() {
    return this._filterStack[this._stackIndex];
  }
  set font(value) {
    let ex;
    try {
      const result = (0, _cssfontparser.default)(value);
      value = this._fontStack[this._stackIndex] = result.toString();
      const event = (0, _createCanvasEvent.default)('font', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    } catch (ex) {}
  }
  get font() {
    return this._fontStack[this._stackIndex];
  }
  getImageData(x, y, w, h) {
    if (arguments.length < 4) throw new TypeError("Failed to execute 'getImageData' on '" + this.constructor.name + "': 4 arguments required, but only " + arguments.length + ' present.');
    if (w == 0 || h == 0) throw new DOMException("Failed to execute 'getImageData' on '" + this.constructor.name + "': The source " + (w == 0 ? 'width' : 'height') + ' is 0.', 'IndexSizeError');
    return new ImageData(Math.abs(w), Math.abs(h));
  }
  getLineDash() {
    return this._lineDashStack[this._stackIndex];
  }
  getTransform() {
    return new _DOMMatrix.default(this._transformStack[this._stackIndex]);
  }
  set globalAlpha(value) {
    value = Number(value);
    if (!Number.isFinite(value)) return;
    if (value < 0) return;
    if (value > 1) return;
    this._globalAlphaStack[this._stackIndex] = value;
    const event = (0, _createCanvasEvent.default)('globalAlpha', getTransformSlice(this), {
      value
    });
    this._events.push(event);
  }
  get globalAlpha() {
    return this._globalAlphaStack[this._stackIndex];
  }
  set globalCompositeOperation(value) {
    if (compositeOperations.indexOf(value) !== -1) {
      this._globalCompositeOperationStack[this._stackIndex] = value;
      const event = (0, _createCanvasEvent.default)('globalCompositeOperation', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get globalCompositeOperation() {
    return this._globalCompositeOperationStack[this._stackIndex];
  }
  set imageSmoothingEnabled(value) {
    value = this._imageSmoothingEnabledStack[this._stackIndex] = Boolean(value);
    const event = (0, _createCanvasEvent.default)('imageSmoothingEnabled', getTransformSlice(this), {
      value
    });
    this._events.push(event);
  }
  get imageSmoothingEnabled() {
    return this._imageSmoothingEnabledStack[this._stackIndex];
  }
  set imageSmoothingQuality(value) {
    if (value === 'high' || value === 'medium' || value === 'low') {
      this._imageSmoothingQualityStack[this._stackIndex] = value;
      const event = (0, _createCanvasEvent.default)('imageSmoothingQuality', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get imageSmoothingQuality() {
    return this._imageSmoothingQualityStack[this._stackIndex];
  }
  isPointInPath(path, x, y, fillRule = 'nonzero') {
    if (arguments.length < 2) throw new TypeError("Failed to execute 'isPointInPath' on '" + this.constructor.name + "': 2 arguments required, but only " + arguments.length + ' present.');
    if (!(path instanceof _Path2D.default)) {
      if (arguments.length > 2) {
        fillRule = y;
      }
      y = x;
      x = path;
    }
    if (fillRule !== 'nonzero' && fillRule !== 'evenodd') throw new TypeError("Failed to execute 'isPointInPath' on '" + this.constructor.name + "': The provided value '" + fillRule + "' is not a valid enum value of type CanvasFillRule.");
    const event = (0, _createCanvasEvent.default)('isPointInPath', getTransformSlice(this), {
      x: Number(x),
      y: Number(y),
      fillRule,
      path: path instanceof _Path2D.default ? path._path.slice() : this._path.slice()
    });
    this._events.push(event);
    return false; // return false in a mocking environment, unless I can verify a point is actually within the path
  }

  isPointInStroke(path, x, y) {
    if (arguments.length < 2) throw new TypeError("Failed to execute 'isPointInStroke' on '" + this.constructor.name + "': 2 arguments required, but only " + arguments.length + ' present.');
    if (!(path instanceof _Path2D.default)) {
      y = x;
      x = path;
    }
    const event = (0, _createCanvasEvent.default)('isPointInPath', getTransformSlice(this), {
      x: Number(x),
      y: Number(y),
      path: path instanceof _Path2D.default ? path._path.slice() : this._path.slice()
    });
    this._events.push(event);
    return false; // return false in a mocking environment, unless I can verify a point is actually within the path
  }

  set lineCap(value) {
    if (value === 'butt' || value === 'round' || value === 'square') {
      this._lineCapStack[this._stackIndex] = value;
      const event = (0, _createCanvasEvent.default)('lineCap', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get lineCap() {
    return this._lineCapStack[this._stackIndex];
  }
  set lineDashOffset(value) {
    const result = Number(value);
    if (Number.isFinite(result)) {
      this._lineDashOffsetStack[this._stackIndex] = result;
      const event = (0, _createCanvasEvent.default)('lineDashOffset', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get lineDashOffset() {
    return this._lineDashOffsetStack[this._stackIndex];
  }
  set lineJoin(value) {
    if (value === 'round' || value === 'bevel' || value === 'miter') {
      this._lineJoinStack[this._stackIndex] = value;
      const event = (0, _createCanvasEvent.default)('lineJoin', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get lineJoin() {
    return this._lineJoinStack[this._stackIndex];
  }
  lineTo(x, y) {
    if (arguments.length < 2) throw new TypeError("Failed to execute 'lineTo' on '" + this.constructor.name + "': 2 arguments required, but only " + arguments.length + ' present.');
    const xResult = Number(x);
    const yResult = Number(y);
    if (!Number.isFinite(xResult + yResult)) return;
    const event = (0, _createCanvasEvent.default)('lineTo', getTransformSlice(this), {
      x: xResult,
      y: yResult
    });
    this._events.push(event);
    this._path.push(event);
  }
  set lineWidth(value) {
    const result = Number(value);
    if (Number.isFinite(result) && result > 0) {
      this._lineWidthStack[this._stackIndex] = result;
      const event = (0, _createCanvasEvent.default)('lineWidth', getTransformSlice(this), {
        value: result
      });
      this._events.push(event);
    }
  }
  get lineWidth() {
    return this._lineWidthStack[this._stackIndex];
  }
  measureText(text) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'measureText' on '" + this.constructor.name + "': 1 argument required, but only 0 present.");
    text = text == null ? '' : text;
    text = text.toString();
    const event = (0, _createCanvasEvent.default)('measureText', getTransformSlice(this), {
      text
    });
    this._events.push(event);
    return new _TextMetrics.default(text);
  }
  set miterLimit(value) {
    const result = Number(value);
    if (Number.isFinite(result) && result > 0) {
      this._miterLimitStack[this._stackIndex] = result;
      const event = (0, _createCanvasEvent.default)('lineWidth', getTransformSlice(this), {
        value: result
      });
      this._events.push(event);
    }
  }
  get miterLimit() {
    return this._miterLimitStack[this._stackIndex];
  }
  moveTo(x, y) {
    if (arguments.length < 2) throw new TypeError("Failed to execute 'moveTo' on '" + this.constructor.name + "': 2 arguments required, but only " + arguments.length + ' present.');
    const xResult = Number(x);
    const yResult = Number(y);
    if (!Number.isFinite(x + y)) return;
    const event = (0, _createCanvasEvent.default)('moveTo', getTransformSlice(this), {
      x: xResult,
      y: yResult
    });
    this._events.push(event);
    this._path.push(event);
  }
  putImageData(data, x, y, dirtyX, dirtyY, dirtyWidth, dirtyHeight) {
    if (arguments.length < 3) throw new TypeError("Failed to execute 'putImageData' on '" + this.constructor.name + "': 3 arguments required, but only " + arguments.length + ' present.');
    if (arguments.length > 3 && arguments.length < 7) throw new TypeError("Failed to execute 'putImageData' on '" + this.constructor.name + "': Valid arities are: [3, 7], but " + arguments.length + ' arguments provided.');
    if (!(data instanceof ImageData)) throw new TypeError("Failed to execute 'putImageData' on '" + this.constructor.name + "': parameter 1 is not of type 'ImageData'.");
    const xResult = Number(x);
    const yResult = Number(y);
    const dirtyXResult = Number(dirtyX);
    const dirtyYResult = Number(dirtyY);
    const dirtyWidthResult = Number(dirtyWidth);
    const dirtyHeightResult = Number(dirtyHeight);
    if (arguments.length === 3) {
      if (!Number.isFinite(xResult + yResult)) return;
    } else {
      if (!Number.isFinite(xResult + yResult + dirtyXResult + dirtyYResult + dirtyWidthResult + dirtyHeightResult)) return;
    }
    const event = (0, _createCanvasEvent.default)('putImageData', getTransformSlice(this), {
      x: xResult,
      y: yResult,
      dirtyX: dirtyXResult,
      dirtyY: dirtyYResult,
      dirtyWidth: dirtyWidthResult,
      dirtyHeight: dirtyHeightResult
    });
    this._events.push(event);
  }
  quadraticCurveTo(cpx, cpy, x, y) {
    if (arguments.length < 4) throw new TypeError("Failed to execute 'quadraticCurveTo' on '" + this.constructor.name + "': 4 arguments required, but only " + arguments.length + ' present.');
    const cpxResult = Number(cpx);
    const cpyResult = Number(cpy);
    const xResult = Number(x);
    const yResult = Number(y);
    if (!Number.isFinite(cpxResult + cpyResult + xResult + yResult)) return;
    const event = (0, _createCanvasEvent.default)('quadraticCurveTo', getTransformSlice(this), {
      cpx: cpxResult,
      cpy: cpyResult,
      x: xResult,
      y: yResult
    });
    this._events.push(event);
  }
  rect(x, y, width, height) {
    if (arguments.length < 4) throw new TypeError("Failed to execute 'rect' on '" + this.constructor.name + "': 4 arguments required, but only " + arguments.length + ' present.');
    if (!Number.isFinite(x + y + width + height)) return;
    const xResult = Number(x);
    const yResult = Number(y);
    const widthResult = Number(width);
    const heightResult = Number(height);
    const event = (0, _createCanvasEvent.default)('rect', getTransformSlice(this), {
      x: xResult,
      y: yResult,
      width: widthResult,
      height: heightResult
    });
    this._events.push(event);
    this._path.push(event);
  }
  removeHitRegion(id) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'removeHitRegion' on '" + this.constructor.name + "': 1 argument required, but only " + arguments.length + ' present.');
    const event = (0, _createCanvasEvent.default)('removeHitRegion', getTransformSlice(this), {
      id
    });
    this._events.push(event);
  }
  resetTransform() {
    this._transformStack[this._stackIndex][0] = 1;
    this._transformStack[this._stackIndex][1] = 0;
    this._transformStack[this._stackIndex][2] = 0;
    this._transformStack[this._stackIndex][3] = 1;
    this._transformStack[this._stackIndex][4] = 0;
    this._transformStack[this._stackIndex][5] = 0;
    const event = (0, _createCanvasEvent.default)('resetTransform', getTransformSlice(this), {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0
    });
    this._events.push(event);
  }
  restore() {
    if (this._stackIndex <= 0) return;
    this._transformStack.pop();
    this._clipStack.pop();
    this._directionStack.pop();
    this._fillStyleStack.pop();
    this._filterStack.pop();
    this._fontStack.pop();
    this._globalAlphaStack.pop();
    this._globalCompositeOperationStack.pop();
    this._imageSmoothingEnabledStack.pop();
    this._imageSmoothingQualityStack.pop();
    this._lineCapStack.pop();
    this._lineDashStack.pop();
    this._lineDashOffsetStack.pop();
    this._lineJoinStack.pop();
    this._lineWidthStack.pop();
    this._miterLimitStack.pop();
    this._shadowBlurStack.pop();
    this._shadowColorStack.pop();
    this._shadowOffsetXStack.pop();
    this._shadowOffsetYStack.pop();
    this._strokeStyleStack.pop();
    this._textAlignStack.pop();
    this._textBaselineStack.pop();
    this._stackIndex -= 1;
    const event = (0, _createCanvasEvent.default)('restore', getTransformSlice(this), {});
    this._events.push(event);
  }
  rotate(angle) {
    if (arguments.length < 1) throw new TypeError("Failed to execute 'rotate' on '" + this.constructor.name + "': 1 argument required, but only 0 present.");
    angle = Number(angle);
    if (!Number.isFinite(angle)) return;
    const a = this._transformStack[this._stackIndex][0];
    const b = this._transformStack[this._stackIndex][1];
    const c = this._transformStack[this._stackIndex][2];
    const d = this._transformStack[this._stackIndex][3];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this._transformStack[this._stackIndex][0] = a * cos + c * sin;
    this._transformStack[this._stackIndex][1] = b * cos + d * sin;
    this._transformStack[this._stackIndex][2] = c * cos - a * sin;
    this._transformStack[this._stackIndex][3] = d * cos - b * sin;
    const event = (0, _createCanvasEvent.default)('rotate', getTransformSlice(this), {
      angle
    });
    this._events.push(event);
  }
  save() {
    const stackIndex = this._stackIndex;
    this._transformStack.push(this._transformStack[stackIndex].slice());
    this._directionStack.push(this._directionStack[stackIndex]);
    this._fillStyleStack.push(this._fillStyleStack[stackIndex]);
    this._filterStack.push(this._filterStack[stackIndex]);
    this._fontStack.push(this._fontStack[stackIndex]);
    this._globalAlphaStack.push(this._globalAlphaStack[stackIndex]);
    this._globalCompositeOperationStack.push(this._globalCompositeOperationStack[stackIndex]);
    this._imageSmoothingEnabledStack.push(this._imageSmoothingEnabledStack[stackIndex]);
    this._imageSmoothingQualityStack.push(this._imageSmoothingQualityStack[stackIndex]);
    this._lineCapStack.push(this._lineCapStack[stackIndex]);
    this._lineDashStack.push(this._lineDashStack[stackIndex]);
    this._lineDashOffsetStack.push(this._lineDashOffsetStack[stackIndex]);
    this._lineJoinStack.push(this._lineJoinStack[stackIndex]);
    this._lineWidthStack.push(this._lineWidthStack[stackIndex]);
    this._miterLimitStack.push(this._miterLimitStack[stackIndex]);
    this._shadowBlurStack.push(this._shadowBlurStack[stackIndex]);
    this._shadowColorStack.push(this._shadowColorStack[stackIndex]);
    this._shadowOffsetXStack.push(this._shadowOffsetXStack[stackIndex]);
    this._shadowOffsetYStack.push(this._shadowOffsetYStack[stackIndex]);
    this._strokeStyleStack.push(this._strokeStyleStack[stackIndex]);
    this._textAlignStack.push(this._textAlignStack[stackIndex]);
    this._textBaselineStack.push(this._textBaselineStack[stackIndex]);
    this._clipStack.push(this._clipStack[stackIndex].slice());
    this._stackIndex = stackIndex + 1;
    const event = (0, _createCanvasEvent.default)('save', getTransformSlice(this), {});
    this._events.push(event);
  }
  scale(x, y) {
    if (arguments.length < 2) throw new TypeError("Failed to execute 'scale' on '" + this.constructor.name + "': 2 arguments required, but only " + arguments.length + ' present.');
    const xResult = Number(x);
    const yResult = Number(y);
    if (Number.isFinite(xResult) && Number.isFinite(yResult)) {
      this._transformStack[this._stackIndex][0] *= xResult;
      this._transformStack[this._stackIndex][1] *= xResult;
      this._transformStack[this._stackIndex][2] *= yResult;
      this._transformStack[this._stackIndex][3] *= yResult;
      const event = (0, _createCanvasEvent.default)('scale', getTransformSlice(this), {
        x: xResult,
        y: yResult
      });
      this._events.push(event);
    }
  }
  scrollPathIntoView(path) {
    if (arguments.length > 0 && path instanceof _Path2D.default) path = path._path.slice();else path = this._path.slice();
    const event = (0, _createCanvasEvent.default)('scrollPathIntoView', getTransformSlice(this), {
      path
    });
    this._events.push(event);
  }
  setLineDash(lineDash) {
    const isSequence = [Array, Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array].reduce((left, right) => left || lineDash instanceof right, false);
    if (!isSequence) throw new TypeError("Failed to execute 'setLineDash' on '" + this.constructor.name + "': The provided value cannot be converted to a sequence.");
    let result = [];
    for (let i = 0; i < lineDash.length; i++) {
      const value = Number(lineDash[i]);
      if (Number.isFinite(value) && value >= 0) {
        result.push(value);
      } else {
        return;
      }
    }
    result = this._lineDashStack[this._stackIndex] = result.length % 2 === 1 ? result.concat(result) : result;
    const event = (0, _createCanvasEvent.default)('setLineDash', getTransformSlice(this), {
      segments: result.slice()
    });
    this._events.push(event);
  }
  setTransform(a, b, c, d, e, f) {
    if (arguments.length === 0) {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
    } else if (arguments.length === 1) {
      if (a instanceof _DOMMatrix.default) {
        let transform = a;
        a = transform.a;
        b = transform.b;
        c = transform.c;
        d = transform.d;
        e = transform.e;
        f = transform.f;
      } else {
        throw new TypeError("Failed to execute 'setTransform' on '" + this.constructor.name + "': parameter " + a + " ('transform') is not an object.");
      }
    } else if (arguments.length < 6) {
      throw new TypeError("Failed to execute 'setTransform' on '" + this.constructor.name + "': Valid arities are: [0, 1, 6], but " + arguments.length + ' arguments provided.');
    }
    a = Number(a);
    b = Number(b);
    c = Number(c);
    d = Number(d);
    e = Number(e);
    f = Number(f);
    if (!Number.isFinite(a + b + c + d + e + f)) return;
    this._transformStack[this._stackIndex][0] = a;
    this._transformStack[this._stackIndex][1] = b;
    this._transformStack[this._stackIndex][2] = c;
    this._transformStack[this._stackIndex][3] = d;
    this._transformStack[this._stackIndex][4] = e;
    this._transformStack[this._stackIndex][5] = f;
    const event = (0, _createCanvasEvent.default)('setTransform', getTransformSlice(this), {
      a,
      b,
      c,
      d,
      e,
      f
    });
    this._events.push(event);
  }
  set shadowBlur(value) {
    const result = Number(value);
    if (Number.isFinite(result) && result > 0) {
      this._shadowBlurStack[this._stackIndex] = result;
      const event = (0, _createCanvasEvent.default)('shadowBlur', getTransformSlice(this), {
        value: result
      });
      this._events.push(event);
    }
  }
  get shadowBlur() {
    return this._shadowBlurStack[this._stackIndex];
  }
  set shadowColor(value) {
    if (typeof value === 'string') {
      try {
        const result = new _mooColor.MooColor(value);
        value = this._shadowColorStack[this._stackIndex] = serializeColor(result);
      } catch (e) {
        return;
      }
      const event = (0, _createCanvasEvent.default)('shadowColor', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get shadowColor() {
    return this._shadowColorStack[this._stackIndex];
  }
  set shadowOffsetX(value) {
    const result = Number(value);
    if (Number.isFinite(result)) {
      this._shadowOffsetXStack[this._stackIndex] = result;
      const event = (0, _createCanvasEvent.default)('shadowOffsetX', getTransformSlice(this), {
        value: result
      });
      this._events.push(event);
    }
  }
  get shadowOffsetX() {
    return this._shadowOffsetXStack[this._stackIndex];
  }
  set shadowOffsetY(value) {
    const result = Number(value);
    if (Number.isFinite(result)) {
      this._shadowOffsetXStack[this._stackIndex] = result;
      const event = (0, _createCanvasEvent.default)('shadowOffsetY', getTransformSlice(this), {
        value: result
      });
      this._events.push(event);
    }
  }
  get shadowOffsetY() {
    return this._shadowOffsetXStack[this._stackIndex];
  }
  stroke(path) {
    if (arguments.length === 0) {
      path = this._path.slice();
    } else {
      if (!(path instanceof _Path2D.default)) throw new TypeError("Failed to execute 'stroke' on '" + this.constructor.name + "': parameter 1 is not of type 'Path2D'.");
      path = path._path.slice();
    }
    const event = (0, _createCanvasEvent.default)('stroke', getTransformSlice(this), {
      path
    });
    this._events.push(event);
    this._drawCalls.push(event);
  }
  strokeRect(x, y, width, height) {
    if (arguments.length < 4) throw new TypeError("Failed to execute 'strokeRect' on '" + this.constructor.name + "': 4 arguments required, but only " + arguments.length + ' present.');
    x = Number(x);
    y = Number(y);
    width = Number(width);
    height = Number(height);
    if (!Number.isFinite(x + y + width + height)) return;
    const event = (0, _createCanvasEvent.default)('strokeRect', getTransformSlice(this), {
      x,
      y,
      width,
      height
    });
    this._events.push(event);
    this._drawCalls.push(event);
  }
  set strokeStyle(value) {
    let valid = false;
    if (typeof value === 'string') {
      try {
        const result = new _mooColor.MooColor(value);
        valid = true;
        value = this._strokeStyleStack[this._stackIndex] = serializeColor(result);
      } catch (e) {
        return;
      }
    } else if (value instanceof CanvasGradient || value instanceof _CanvasPattern.default) {
      valid = true;
      this._strokeStyleStack[this._stackIndex] = value;
    }
    if (valid) {
      const event = (0, _createCanvasEvent.default)('strokeStyle', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get strokeStyle() {
    return this._strokeStyleStack[this._stackIndex];
  }
  strokeText(text, x, y, maxWidth) {
    if (arguments.length < 3) throw new TypeError("Failed to execute 'strokeText' on '" + this.constructor.name + "': 3 arguments required, but only " + arguments.length + ' present.');
    const textResult = String(text);
    const xResult = Number(x);
    const yResult = Number(y);
    const maxWidthResult = Number(maxWidth);
    if (arguments.length === 3 && !Number.isFinite(xResult + yResult)) return;
    if (arguments.length > 3 && !Number.isFinite(xResult + yResult + maxWidthResult)) return;
    const event = (0, _createCanvasEvent.default)('strokeText', getTransformSlice(this), {
      text: textResult,
      x: xResult,
      y: yResult,
      maxWidth: arguments.length === 3 ? null : maxWidthResult
    });
    this._events.push(event);
    this._drawCalls.push(event);
  }
  set textAlign(value) {
    if (value === 'left' || value === 'right' || value === 'center' || value === 'start' || value === 'end') {
      this._textAlignStack[this._stackIndex] = value;
      const event = (0, _createCanvasEvent.default)('textAlign', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get textAlign() {
    return this._textAlignStack[this._stackIndex];
  }
  set textBaseline(value) {
    if (value === 'top' || value === 'hanging' || value === 'middle' || value === 'alphabetic' || value === 'ideographic' || value === 'bottom') {
      this._textBaselineStack[this._stackIndex] = value;
      const event = (0, _createCanvasEvent.default)('textBaseline', getTransformSlice(this), {
        value
      });
      this._events.push(event);
    }
  }
  get textBaseline() {
    return this._textBaselineStack[this._stackIndex];
  }
  transform(a, b, c, d, e, f) {
    if (arguments.length < 6) throw new TypeError("Failed to execute 'transform' on '" + this.constructor.name + "': 6 arguments required, but only " + arguments.length + ' present.');
    a = Number(a);
    b = Number(b);
    c = Number(c);
    d = Number(d);
    e = Number(e);
    f = Number(f);
    if (!Number.isFinite(a + b + c + d + e + f)) return;
    const sa = this._transformStack[this._stackIndex][0];
    const sb = this._transformStack[this._stackIndex][1];
    const sc = this._transformStack[this._stackIndex][2];
    const sd = this._transformStack[this._stackIndex][3];
    const se = this._transformStack[this._stackIndex][4];
    const sf = this._transformStack[this._stackIndex][5];
    this._transformStack[this._stackIndex][0] = sa * a + sc * b;
    this._transformStack[this._stackIndex][1] = sb * a + sd * b;
    this._transformStack[this._stackIndex][2] = sa * c + sc * d;
    this._transformStack[this._stackIndex][3] = sb * c + sd * d;
    this._transformStack[this._stackIndex][4] = sa * e + sc * f + se;
    this._transformStack[this._stackIndex][5] = sb * e + sd * f + sf;
    const event = (0, _createCanvasEvent.default)('transform', getTransformSlice(this), {
      a,
      b,
      c,
      d,
      e,
      f
    });
    this._events.push(event);
  }
  translate(x, y) {
    if (arguments.length < 2) throw new TypeError("Failed to execute 'translate' on '" + this.constructor.name + "': 2 arguments required, but only " + arguments.length + ' present.');
    const xResult = Number(x);
    const yResult = Number(y);
    const a = this._transformStack[this._stackIndex][0];
    const b = this._transformStack[this._stackIndex][1];
    const c = this._transformStack[this._stackIndex][2];
    const d = this._transformStack[this._stackIndex][3];
    if (Number.isFinite(xResult + yResult)) {
      this._transformStack[this._stackIndex][4] += a * xResult + c * yResult;
      this._transformStack[this._stackIndex][5] += b * xResult + d * yResult;
      const event = (0, _createCanvasEvent.default)('translate', getTransformSlice(this), {
        x: xResult,
        y: yResult
      });
      this._events.push(event);
    }
  }
}
exports.default = CanvasRenderingContext2D;