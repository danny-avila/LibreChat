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
exports.resourceToDataURL = exports.fetchAsDataURL = exports.makeDataUrl = exports.isDataUrl = void 0;
function getContentFromDataUrl(dataURL) {
    return dataURL.split(/,/)[1];
}
function isDataUrl(url) {
    return url.search(/^(data:)/) !== -1;
}
exports.isDataUrl = isDataUrl;
function makeDataUrl(content, mimeType) {
    return "data:".concat(mimeType, ";base64,").concat(content);
}
exports.makeDataUrl = makeDataUrl;
function fetchAsDataURL(url, init, process) {
    return __awaiter(this, void 0, void 0, function () {
        var res, blob;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(url, init)];
                case 1:
                    res = _a.sent();
                    if (res.status === 404) {
                        throw new Error("Resource \"".concat(res.url, "\" not found"));
                    }
                    return [4 /*yield*/, res.blob()];
                case 2:
                    blob = _a.sent();
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            var reader = new FileReader();
                            reader.onerror = reject;
                            reader.onloadend = function () {
                                try {
                                    resolve(process({ res: res, result: reader.result }));
                                }
                                catch (error) {
                                    reject(error);
                                }
                            };
                            reader.readAsDataURL(blob);
                        })];
            }
        });
    });
}
exports.fetchAsDataURL = fetchAsDataURL;
var cache = {};
function getCacheKey(url, contentType, includeQueryParams) {
    var key = url.replace(/\?.*/, '');
    if (includeQueryParams) {
        key = url;
    }
    // font resource
    if (/ttf|otf|eot|woff2?/i.test(key)) {
        key = key.replace(/.*\//, '');
    }
    return contentType ? "[".concat(contentType, "]").concat(key) : key;
}
function resourceToDataURL(resourceUrl, contentType, options) {
    return __awaiter(this, void 0, void 0, function () {
        var cacheKey, dataURL, content, error_1, msg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cacheKey = getCacheKey(resourceUrl, contentType, options.includeQueryParams);
                    if (cache[cacheKey] != null) {
                        return [2 /*return*/, cache[cacheKey]];
                    }
                    // ref: https://developer.mozilla.org/en/docs/Web/API/XMLHttpRequest/Using_XMLHttpRequest#Bypassing_the_cache
                    if (options.cacheBust) {
                        // eslint-disable-next-line no-param-reassign
                        resourceUrl += (/\?/.test(resourceUrl) ? '&' : '?') + new Date().getTime();
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetchAsDataURL(resourceUrl, options.fetchRequestInit, function (_a) {
                            var res = _a.res, result = _a.result;
                            if (!contentType) {
                                // eslint-disable-next-line no-param-reassign
                                contentType = res.headers.get('Content-Type') || '';
                            }
                            return getContentFromDataUrl(result);
                        })];
                case 2:
                    content = _a.sent();
                    dataURL = makeDataUrl(content, contentType);
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    dataURL = options.imagePlaceholder || '';
                    msg = "Failed to fetch resource: ".concat(resourceUrl);
                    if (error_1) {
                        msg = typeof error_1 === 'string' ? error_1 : error_1.message;
                    }
                    if (msg) {
                        console.warn(msg);
                    }
                    return [3 /*break*/, 4];
                case 4:
                    cache[cacheKey] = dataURL;
                    return [2 /*return*/, dataURL];
            }
        });
    });
}
exports.resourceToDataURL = resourceToDataURL;
//# sourceMappingURL=dataurl.js.map