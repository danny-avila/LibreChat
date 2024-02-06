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
exports.getFontEmbedCSS = exports.toBlob = exports.toJpeg = exports.toPng = exports.toPixelData = exports.toCanvas = exports.toSvg = void 0;
var clone_node_1 = require("./clone-node");
var embed_images_1 = require("./embed-images");
var apply_style_1 = require("./apply-style");
var embed_webfonts_1 = require("./embed-webfonts");
var util_1 = require("./util");
function toSvg(node, options) {
    if (options === void 0) { options = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var _a, width, height, clonedNode, datauri;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = (0, util_1.getImageSize)(node, options), width = _a.width, height = _a.height;
                    return [4 /*yield*/, (0, clone_node_1.cloneNode)(node, options, true)];
                case 1:
                    clonedNode = (_b.sent());
                    return [4 /*yield*/, (0, embed_webfonts_1.embedWebFonts)(clonedNode, options)];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, (0, embed_images_1.embedImages)(clonedNode, options)];
                case 3:
                    _b.sent();
                    (0, apply_style_1.applyStyle)(clonedNode, options);
                    return [4 /*yield*/, (0, util_1.nodeToDataURL)(clonedNode, width, height)];
                case 4:
                    datauri = _b.sent();
                    return [2 /*return*/, datauri];
            }
        });
    });
}
exports.toSvg = toSvg;
function toCanvas(node, options) {
    if (options === void 0) { options = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var _a, width, height, svg, img, canvas, context, ratio, canvasWidth, canvasHeight;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = (0, util_1.getImageSize)(node, options), width = _a.width, height = _a.height;
                    return [4 /*yield*/, toSvg(node, options)];
                case 1:
                    svg = _b.sent();
                    return [4 /*yield*/, (0, util_1.createImage)(svg)];
                case 2:
                    img = _b.sent();
                    canvas = document.createElement('canvas');
                    context = canvas.getContext('2d');
                    ratio = options.pixelRatio || (0, util_1.getPixelRatio)();
                    canvasWidth = options.canvasWidth || width;
                    canvasHeight = options.canvasHeight || height;
                    canvas.width = canvasWidth * ratio;
                    canvas.height = canvasHeight * ratio;
                    if (!options.skipAutoScale) {
                        (0, util_1.checkCanvasDimensions)(canvas);
                    }
                    canvas.style.width = "".concat(canvasWidth);
                    canvas.style.height = "".concat(canvasHeight);
                    if (options.backgroundColor) {
                        context.fillStyle = options.backgroundColor;
                        context.fillRect(0, 0, canvas.width, canvas.height);
                    }
                    context.drawImage(img, 0, 0, canvas.width, canvas.height);
                    return [2 /*return*/, canvas];
            }
        });
    });
}
exports.toCanvas = toCanvas;
function toPixelData(node, options) {
    if (options === void 0) { options = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var _a, width, height, canvas, ctx;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = (0, util_1.getImageSize)(node, options), width = _a.width, height = _a.height;
                    return [4 /*yield*/, toCanvas(node, options)];
                case 1:
                    canvas = _b.sent();
                    ctx = canvas.getContext('2d');
                    return [2 /*return*/, ctx.getImageData(0, 0, width, height).data];
            }
        });
    });
}
exports.toPixelData = toPixelData;
function toPng(node, options) {
    if (options === void 0) { options = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var canvas;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, toCanvas(node, options)];
                case 1:
                    canvas = _a.sent();
                    return [2 /*return*/, canvas.toDataURL()];
            }
        });
    });
}
exports.toPng = toPng;
function toJpeg(node, options) {
    if (options === void 0) { options = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var canvas;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, toCanvas(node, options)];
                case 1:
                    canvas = _a.sent();
                    return [2 /*return*/, canvas.toDataURL('image/jpeg', options.quality || 1)];
            }
        });
    });
}
exports.toJpeg = toJpeg;
function toBlob(node, options) {
    if (options === void 0) { options = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var canvas, blob;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, toCanvas(node, options)];
                case 1:
                    canvas = _a.sent();
                    return [4 /*yield*/, (0, util_1.canvasToBlob)(canvas)];
                case 2:
                    blob = _a.sent();
                    return [2 /*return*/, blob];
            }
        });
    });
}
exports.toBlob = toBlob;
function getFontEmbedCSS(node, options) {
    if (options === void 0) { options = {}; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, embed_webfonts_1.getWebFontCSS)(node, options)];
        });
    });
}
exports.getFontEmbedCSS = getFontEmbedCSS;
//# sourceMappingURL=index.js.map