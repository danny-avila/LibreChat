"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInstanceOfElement = exports.nodeToDataURL = exports.svgToDataURL = exports.createImage = exports.canvasToBlob = exports.checkCanvasDimensions = exports.getPixelRatio = exports.getImageSize = exports.toArray = exports.delay = exports.uuid = exports.resolveUrl = void 0;
function resolveUrl(url, baseUrl) {
    // url is absolute already
    if (url.match(/^[a-z]+:\/\//i)) {
        return url;
    }
    // url is absolute already, without protocol
    if (url.match(/^\/\//)) {
        return window.location.protocol + url;
    }
    // dataURI, mailto:, tel:, etc.
    if (url.match(/^[a-z]+:/i)) {
        return url;
    }
    var doc = document.implementation.createHTMLDocument();
    var base = doc.createElement('base');
    var a = doc.createElement('a');
    doc.head.appendChild(base);
    doc.body.appendChild(a);
    if (baseUrl) {
        base.href = baseUrl;
    }
    a.href = url;
    return a.href;
}
exports.resolveUrl = resolveUrl;
exports.uuid = (function () {
    // generate uuid for className of pseudo elements.
    // We should not use GUIDs, otherwise pseudo elements sometimes cannot be captured.
    var counter = 0;
    // ref: http://stackoverflow.com/a/6248722/2519373
    var random = function () {
        // eslint-disable-next-line no-bitwise
        return "0000".concat(((Math.random() * Math.pow(36, 4)) << 0).toString(36)).slice(-4);
    };
    return function () {
        counter += 1;
        return "u".concat(random()).concat(counter);
    };
})();
function delay(ms) {
    return function (args) {
        return new Promise(function (resolve) {
            setTimeout(function () { return resolve(args); }, ms);
        });
    };
}
exports.delay = delay;
function toArray(arrayLike) {
    var arr = [];
    for (var i = 0, l = arrayLike.length; i < l; i++) {
        arr.push(arrayLike[i]);
    }
    return arr;
}
exports.toArray = toArray;
function px(node, styleProperty) {
    var win = node.ownerDocument.defaultView || window;
    var val = win.getComputedStyle(node).getPropertyValue(styleProperty);
    return val ? parseFloat(val.replace('px', '')) : 0;
}
function getNodeWidth(node) {
    var leftBorder = px(node, 'border-left-width');
    var rightBorder = px(node, 'border-right-width');
    return node.clientWidth + leftBorder + rightBorder;
}
function getNodeHeight(node) {
    var topBorder = px(node, 'border-top-width');
    var bottomBorder = px(node, 'border-bottom-width');
    return node.clientHeight + topBorder + bottomBorder;
}
function getImageSize(targetNode, options) {
    if (options === void 0) { options = {}; }
    var width = options.width || getNodeWidth(targetNode);
    var height = options.height || getNodeHeight(targetNode);
    return { width: width, height: height };
}
exports.getImageSize = getImageSize;
function getPixelRatio() {
    var ratio;
    var FINAL_PROCESS;
    try {
        FINAL_PROCESS = process;
    }
    catch (e) {
        // pass
    }
    var val = FINAL_PROCESS && FINAL_PROCESS.env
        ? FINAL_PROCESS.env.devicePixelRatio
        : null;
    if (val) {
        ratio = parseInt(val, 10);
        if (Number.isNaN(ratio)) {
            ratio = 1;
        }
    }
    return ratio || window.devicePixelRatio || 1;
}
exports.getPixelRatio = getPixelRatio;
// @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/canvas#maximum_canvas_size
var canvasDimensionLimit = 16384;
function checkCanvasDimensions(canvas) {
    if (canvas.width > canvasDimensionLimit ||
        canvas.height > canvasDimensionLimit) {
        if (canvas.width > canvasDimensionLimit &&
            canvas.height > canvasDimensionLimit) {
            if (canvas.width > canvas.height) {
                canvas.height *= canvasDimensionLimit / canvas.width;
                canvas.width = canvasDimensionLimit;
            }
            else {
                canvas.width *= canvasDimensionLimit / canvas.height;
                canvas.height = canvasDimensionLimit;
            }
        }
        else if (canvas.width > canvasDimensionLimit) {
            canvas.height *= canvasDimensionLimit / canvas.width;
            canvas.width = canvasDimensionLimit;
        }
        else {
            canvas.width *= canvasDimensionLimit / canvas.height;
            canvas.height = canvasDimensionLimit;
        }
    }
}
exports.checkCanvasDimensions = checkCanvasDimensions;
function canvasToBlob(canvas, options) {
    if (options === void 0) { options = {}; }
    if (canvas.toBlob) {
        return new Promise(function (resolve) {
            canvas.toBlob(resolve, options.type ? options.type : 'image/png', options.quality ? options.quality : 1);
        });
    }
    return new Promise(function (resolve) {
        var binaryString = window.atob(canvas
            .toDataURL(options.type ? options.type : undefined, options.quality ? options.quality : undefined)
            .split(',')[1]);
        var len = binaryString.length;
        var binaryArray = new Uint8Array(len);
        for (var i = 0; i < len; i += 1) {
            binaryArray[i] = binaryString.charCodeAt(i);
        }
        resolve(new Blob([binaryArray], {
            type: options.type ? options.type : 'image/png',
        }));
    });
}
exports.canvasToBlob = canvasToBlob;
function createImage(url) {
    return new Promise(function (resolve, reject) {
        var img = new Image();
        img.decode = function () { return resolve(img); };
        img.onload = function () { return resolve(img); };
        img.onerror = reject;
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.src = url;
    });
}
exports.createImage = createImage;
function svgToDataURL(svg) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, Promise.resolve()
                    .then(function () { return new XMLSerializer().serializeToString(svg); })
                    .then(encodeURIComponent)
                    .then(function (html) { return "data:image/svg+xml;charset=utf-8,".concat(html); })];
        });
    });
}
exports.svgToDataURL = svgToDataURL;
function nodeToDataURL(node, width, height) {
    return __awaiter(this, void 0, void 0, function () {
        var xmlns, svg, foreignObject;
        return __generator(this, function (_a) {
            xmlns = 'http://www.w3.org/2000/svg';
            svg = document.createElementNS(xmlns, 'svg');
            foreignObject = document.createElementNS(xmlns, 'foreignObject');
            svg.setAttribute('width', "".concat(width));
            svg.setAttribute('height', "".concat(height));
            svg.setAttribute('viewBox', "0 0 ".concat(width, " ").concat(height));
            foreignObject.setAttribute('width', '100%');
            foreignObject.setAttribute('height', '100%');
            foreignObject.setAttribute('x', '0');
            foreignObject.setAttribute('y', '0');
            foreignObject.setAttribute('externalResourcesRequired', 'true');
            svg.appendChild(foreignObject);
            foreignObject.appendChild(node);
            return [2 /*return*/, svgToDataURL(svg)];
        });
    });
}
exports.nodeToDataURL = nodeToDataURL;
var isInstanceOfElement = function (node, instance) {
    if (node instanceof instance)
        return true;
    var nodePrototype = Object.getPrototypeOf(node);
    if (nodePrototype === null)
        return false;
    return (nodePrototype.constructor.name === instance.name ||
        (0, exports.isInstanceOfElement)(nodePrototype, instance));
};
exports.isInstanceOfElement = isInstanceOfElement;
//# sourceMappingURL=util.js.map