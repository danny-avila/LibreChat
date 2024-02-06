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
exports.cloneNode = void 0;
var clone_pseudos_1 = require("./clone-pseudos");
var util_1 = require("./util");
var mimes_1 = require("./mimes");
var dataurl_1 = require("./dataurl");
function cloneCanvasElement(canvas) {
    return __awaiter(this, void 0, void 0, function () {
        var dataURL;
        return __generator(this, function (_a) {
            dataURL = canvas.toDataURL();
            if (dataURL === 'data:,') {
                return [2 /*return*/, canvas.cloneNode(false)];
            }
            return [2 /*return*/, (0, util_1.createImage)(dataURL)];
        });
    });
}
function cloneVideoElement(video, options) {
    return __awaiter(this, void 0, void 0, function () {
        var canvas, ctx, dataURL_1, poster, contentType, dataURL;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (video.currentSrc) {
                        canvas = document.createElement('canvas');
                        ctx = canvas.getContext('2d');
                        canvas.width = video.clientWidth;
                        canvas.height = video.clientHeight;
                        ctx === null || ctx === void 0 ? void 0 : ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        dataURL_1 = canvas.toDataURL();
                        return [2 /*return*/, (0, util_1.createImage)(dataURL_1)];
                    }
                    poster = video.poster;
                    contentType = (0, mimes_1.getMimeType)(poster);
                    return [4 /*yield*/, (0, dataurl_1.resourceToDataURL)(poster, contentType, options)];
                case 1:
                    dataURL = _a.sent();
                    return [2 /*return*/, (0, util_1.createImage)(dataURL)];
            }
        });
    });
}
function cloneIFrameElement(iframe) {
    var _a;
    return __awaiter(this, void 0, void 0, function () {
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 3, , 4]);
                    if (!((_a = iframe === null || iframe === void 0 ? void 0 : iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.body)) return [3 /*break*/, 2];
                    return [4 /*yield*/, cloneNode(iframe.contentDocument.body, {}, true)];
                case 1: return [2 /*return*/, (_c.sent())];
                case 2: return [3 /*break*/, 4];
                case 3:
                    _b = _c.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, iframe.cloneNode(false)];
            }
        });
    });
}
function cloneSingleNode(node, options) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if ((0, util_1.isInstanceOfElement)(node, HTMLCanvasElement)) {
                return [2 /*return*/, cloneCanvasElement(node)];
            }
            if ((0, util_1.isInstanceOfElement)(node, HTMLVideoElement)) {
                return [2 /*return*/, cloneVideoElement(node, options)];
            }
            if ((0, util_1.isInstanceOfElement)(node, HTMLIFrameElement)) {
                return [2 /*return*/, cloneIFrameElement(node)];
            }
            return [2 /*return*/, node.cloneNode(false)];
        });
    });
}
var isSlotElement = function (node) {
    return node.tagName != null && node.tagName.toUpperCase() === 'SLOT';
};
function cloneChildren(nativeNode, clonedNode, options) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function () {
        var children;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    children = [];
                    if (isSlotElement(nativeNode) && nativeNode.assignedNodes) {
                        children = (0, util_1.toArray)(nativeNode.assignedNodes());
                    }
                    else if ((0, util_1.isInstanceOfElement)(nativeNode, HTMLIFrameElement) &&
                        ((_a = nativeNode.contentDocument) === null || _a === void 0 ? void 0 : _a.body)) {
                        children = (0, util_1.toArray)(nativeNode.contentDocument.body.childNodes);
                    }
                    else {
                        children = (0, util_1.toArray)(((_b = nativeNode.shadowRoot) !== null && _b !== void 0 ? _b : nativeNode).childNodes);
                    }
                    if (children.length === 0 ||
                        (0, util_1.isInstanceOfElement)(nativeNode, HTMLVideoElement)) {
                        return [2 /*return*/, clonedNode];
                    }
                    return [4 /*yield*/, children.reduce(function (deferred, child) {
                            return deferred
                                .then(function () { return cloneNode(child, options); })
                                .then(function (clonedChild) {
                                if (clonedChild) {
                                    clonedNode.appendChild(clonedChild);
                                }
                            });
                        }, Promise.resolve())];
                case 1:
                    _c.sent();
                    return [2 /*return*/, clonedNode];
            }
        });
    });
}
function cloneCSSStyle(nativeNode, clonedNode) {
    var targetStyle = clonedNode.style;
    if (!targetStyle) {
        return;
    }
    var sourceStyle = window.getComputedStyle(nativeNode);
    if (sourceStyle.cssText) {
        targetStyle.cssText = sourceStyle.cssText;
        targetStyle.transformOrigin = sourceStyle.transformOrigin;
    }
    else {
        (0, util_1.toArray)(sourceStyle).forEach(function (name) {
            var value = sourceStyle.getPropertyValue(name);
            if (name === 'font-size' && value.endsWith('px')) {
                var reducedFont = Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1;
                value = "".concat(reducedFont, "px");
            }
            if ((0, util_1.isInstanceOfElement)(nativeNode, HTMLIFrameElement) &&
                name === 'display' &&
                value === 'inline') {
                value = 'block';
            }
            if (name === 'd' && clonedNode.getAttribute('d')) {
                value = "path(".concat(clonedNode.getAttribute('d'), ")");
            }
            targetStyle.setProperty(name, value, sourceStyle.getPropertyPriority(name));
        });
    }
}
function cloneInputValue(nativeNode, clonedNode) {
    if ((0, util_1.isInstanceOfElement)(nativeNode, HTMLTextAreaElement)) {
        clonedNode.innerHTML = nativeNode.value;
    }
    if ((0, util_1.isInstanceOfElement)(nativeNode, HTMLInputElement)) {
        clonedNode.setAttribute('value', nativeNode.value);
    }
}
function cloneSelectValue(nativeNode, clonedNode) {
    if ((0, util_1.isInstanceOfElement)(nativeNode, HTMLSelectElement)) {
        var clonedSelect = clonedNode;
        var selectedOption = Array.from(clonedSelect.children).find(function (child) { return nativeNode.value === child.getAttribute('value'); });
        if (selectedOption) {
            selectedOption.setAttribute('selected', '');
        }
    }
}
function decorate(nativeNode, clonedNode) {
    if ((0, util_1.isInstanceOfElement)(clonedNode, Element)) {
        cloneCSSStyle(nativeNode, clonedNode);
        (0, clone_pseudos_1.clonePseudoElements)(nativeNode, clonedNode);
        cloneInputValue(nativeNode, clonedNode);
        cloneSelectValue(nativeNode, clonedNode);
    }
    return clonedNode;
}
function ensureSVGSymbols(clone, options) {
    return __awaiter(this, void 0, void 0, function () {
        var uses, processedDefs, i, use, id, exist, definition, _a, _b, nodes, ns, svg, defs, i;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    uses = clone.querySelectorAll ? clone.querySelectorAll('use') : [];
                    if (uses.length === 0) {
                        return [2 /*return*/, clone];
                    }
                    processedDefs = {};
                    i = 0;
                    _c.label = 1;
                case 1:
                    if (!(i < uses.length)) return [3 /*break*/, 4];
                    use = uses[i];
                    id = use.getAttribute('xlink:href');
                    if (!id) return [3 /*break*/, 3];
                    exist = clone.querySelector(id);
                    definition = document.querySelector(id);
                    if (!(!exist && definition && !processedDefs[id])) return [3 /*break*/, 3];
                    // eslint-disable-next-line no-await-in-loop
                    _a = processedDefs;
                    _b = id;
                    return [4 /*yield*/, cloneNode(definition, options, true)];
                case 2:
                    // eslint-disable-next-line no-await-in-loop
                    _a[_b] = (_c.sent());
                    _c.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4:
                    nodes = Object.values(processedDefs);
                    if (nodes.length) {
                        ns = 'http://www.w3.org/1999/xhtml';
                        svg = document.createElementNS(ns, 'svg');
                        svg.setAttribute('xmlns', ns);
                        svg.style.position = 'absolute';
                        svg.style.width = '0';
                        svg.style.height = '0';
                        svg.style.overflow = 'hidden';
                        svg.style.display = 'none';
                        defs = document.createElementNS(ns, 'defs');
                        svg.appendChild(defs);
                        for (i = 0; i < nodes.length; i++) {
                            defs.appendChild(nodes[i]);
                        }
                        clone.appendChild(svg);
                    }
                    return [2 /*return*/, clone];
            }
        });
    });
}
function cloneNode(node, options, isRoot) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!isRoot && options.filter && !options.filter(node)) {
                return [2 /*return*/, null];
            }
            return [2 /*return*/, Promise.resolve(node)
                    .then(function (clonedNode) { return cloneSingleNode(clonedNode, options); })
                    .then(function (clonedNode) { return cloneChildren(node, clonedNode, options); })
                    .then(function (clonedNode) { return decorate(node, clonedNode); })
                    .then(function (clonedNode) { return ensureSVGSymbols(clonedNode, options); })];
        });
    });
}
exports.cloneNode = cloneNode;
//# sourceMappingURL=clone-node.js.map