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
exports.embedResources = exports.shouldEmbed = exports.embed = exports.parseURLs = void 0;
var util_1 = require("./util");
var mimes_1 = require("./mimes");
var dataurl_1 = require("./dataurl");
var URL_REGEX = /url\((['"]?)([^'"]+?)\1\)/g;
var URL_WITH_FORMAT_REGEX = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g;
var FONT_SRC_REGEX = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
function toRegex(url) {
    // eslint-disable-next-line no-useless-escape
    var escaped = url.replace(/([.*+?^${}()|\[\]\/\\])/g, '\\$1');
    return new RegExp("(url\\(['\"]?)(".concat(escaped, ")(['\"]?\\))"), 'g');
}
function parseURLs(cssText) {
    var urls = [];
    cssText.replace(URL_REGEX, function (raw, quotation, url) {
        urls.push(url);
        return raw;
    });
    return urls.filter(function (url) { return !(0, dataurl_1.isDataUrl)(url); });
}
exports.parseURLs = parseURLs;
function embed(cssText, resourceURL, baseURL, options, getContentFromUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var resolvedURL, contentType, dataURL, content, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    resolvedURL = baseURL ? (0, util_1.resolveUrl)(resourceURL, baseURL) : resourceURL;
                    contentType = (0, mimes_1.getMimeType)(resourceURL);
                    dataURL = void 0;
                    if (!getContentFromUrl) return [3 /*break*/, 2];
                    return [4 /*yield*/, getContentFromUrl(resolvedURL)];
                case 1:
                    content = _a.sent();
                    dataURL = (0, dataurl_1.makeDataUrl)(content, contentType);
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, (0, dataurl_1.resourceToDataURL)(resolvedURL, contentType, options)];
                case 3:
                    dataURL = _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/, cssText.replace(toRegex(resourceURL), "$1".concat(dataURL, "$3"))];
                case 5:
                    error_1 = _a.sent();
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/, cssText];
            }
        });
    });
}
exports.embed = embed;
function filterPreferredFontFormat(str, _a) {
    var preferredFontFormat = _a.preferredFontFormat;
    return !preferredFontFormat
        ? str
        : str.replace(FONT_SRC_REGEX, function (match) {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                var _a = URL_WITH_FORMAT_REGEX.exec(match) || [], src = _a[0], format = _a[2];
                if (!format) {
                    return '';
                }
                if (format === preferredFontFormat) {
                    return "src: ".concat(src, ";");
                }
            }
        });
}
function shouldEmbed(url) {
    return url.search(URL_REGEX) !== -1;
}
exports.shouldEmbed = shouldEmbed;
function embedResources(cssText, baseUrl, options) {
    return __awaiter(this, void 0, void 0, function () {
        var filteredCSSText, urls;
        return __generator(this, function (_a) {
            if (!shouldEmbed(cssText)) {
                return [2 /*return*/, cssText];
            }
            filteredCSSText = filterPreferredFontFormat(cssText, options);
            urls = parseURLs(filteredCSSText);
            return [2 /*return*/, urls.reduce(function (deferred, url) {
                    return deferred.then(function (css) { return embed(css, url, baseUrl, options); });
                }, Promise.resolve(filteredCSSText))];
        });
    });
}
exports.embedResources = embedResources;
//# sourceMappingURL=embed-resources.js.map