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
exports.embedWebFonts = exports.getWebFontCSS = void 0;
var util_1 = require("./util");
var dataurl_1 = require("./dataurl");
var embed_resources_1 = require("./embed-resources");
var cssFetchCache = {};
function fetchCSS(url) {
    return __awaiter(this, void 0, void 0, function () {
        var cache, res, cssText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cache = cssFetchCache[url];
                    if (cache != null) {
                        return [2 /*return*/, cache];
                    }
                    return [4 /*yield*/, fetch(url)];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.text()];
                case 2:
                    cssText = _a.sent();
                    cache = { url: url, cssText: cssText };
                    cssFetchCache[url] = cache;
                    return [2 /*return*/, cache];
            }
        });
    });
}
function embedFonts(data, options) {
    return __awaiter(this, void 0, void 0, function () {
        var cssText, regexUrl, fontLocs, loadFonts;
        var _this = this;
        return __generator(this, function (_a) {
            cssText = data.cssText;
            regexUrl = /url\(["']?([^"')]+)["']?\)/g;
            fontLocs = cssText.match(/url\([^)]+\)/g) || [];
            loadFonts = fontLocs.map(function (loc) { return __awaiter(_this, void 0, void 0, function () {
                var url;
                return __generator(this, function (_a) {
                    url = loc.replace(regexUrl, '$1');
                    if (!url.startsWith('https://')) {
                        url = new URL(url, data.url).href;
                    }
                    return [2 /*return*/, (0, dataurl_1.fetchAsDataURL)(url, options.fetchRequestInit, function (_a) {
                            var result = _a.result;
                            cssText = cssText.replace(loc, "url(".concat(result, ")"));
                            return [loc, result];
                        })];
                });
            }); });
            return [2 /*return*/, Promise.all(loadFonts).then(function () { return cssText; })];
        });
    });
}
function parseCSS(source) {
    if (source == null) {
        return [];
    }
    var result = [];
    var commentsRegex = /(\/\*[\s\S]*?\*\/)/gi;
    // strip out comments
    var cssText = source.replace(commentsRegex, '');
    // eslint-disable-next-line prefer-regex-literals
    var keyframesRegex = new RegExp('((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})', 'gi');
    // eslint-disable-next-line no-constant-condition
    while (true) {
        var matches = keyframesRegex.exec(cssText);
        if (matches === null) {
            break;
        }
        result.push(matches[0]);
    }
    cssText = cssText.replace(keyframesRegex, '');
    var importRegex = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi;
    // to match css & media queries together
    var combinedCSSRegex = '((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]' +
        '*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})';
    // unified regex
    var unifiedRegex = new RegExp(combinedCSSRegex, 'gi');
    // eslint-disable-next-line no-constant-condition
    while (true) {
        var matches = importRegex.exec(cssText);
        if (matches === null) {
            matches = unifiedRegex.exec(cssText);
            if (matches === null) {
                break;
            }
            else {
                importRegex.lastIndex = unifiedRegex.lastIndex;
            }
        }
        else {
            unifiedRegex.lastIndex = importRegex.lastIndex;
        }
        result.push(matches[0]);
    }
    return result;
}
function getCSSRules(styleSheets, options) {
    return __awaiter(this, void 0, void 0, function () {
        var ret, deferreds;
        return __generator(this, function (_a) {
            ret = [];
            deferreds = [];
            // First loop inlines imports
            styleSheets.forEach(function (sheet) {
                if ('cssRules' in sheet) {
                    try {
                        (0, util_1.toArray)(sheet.cssRules || []).forEach(function (item, index) {
                            if (item.type === CSSRule.IMPORT_RULE) {
                                var importIndex_1 = index + 1;
                                var url = item.href;
                                var deferred = fetchCSS(url)
                                    .then(function (metadata) { return embedFonts(metadata, options); })
                                    .then(function (cssText) {
                                    return parseCSS(cssText).forEach(function (rule) {
                                        try {
                                            sheet.insertRule(rule, rule.startsWith('@import')
                                                ? (importIndex_1 += 1)
                                                : sheet.cssRules.length);
                                        }
                                        catch (error) {
                                            console.error('Error inserting rule from remote css', {
                                                rule: rule,
                                                error: error,
                                            });
                                        }
                                    });
                                })
                                    .catch(function (e) {
                                    console.error('Error loading remote css', e.toString());
                                });
                                deferreds.push(deferred);
                            }
                        });
                    }
                    catch (e) {
                        var inline_1 = styleSheets.find(function (a) { return a.href == null; }) || document.styleSheets[0];
                        if (sheet.href != null) {
                            deferreds.push(fetchCSS(sheet.href)
                                .then(function (metadata) { return embedFonts(metadata, options); })
                                .then(function (cssText) {
                                return parseCSS(cssText).forEach(function (rule) {
                                    inline_1.insertRule(rule, sheet.cssRules.length);
                                });
                            })
                                .catch(function (err) {
                                console.error('Error loading remote stylesheet', err);
                            }));
                        }
                        console.error('Error inlining remote css file', e);
                    }
                }
            });
            return [2 /*return*/, Promise.all(deferreds).then(function () {
                    // Second loop parses rules
                    styleSheets.forEach(function (sheet) {
                        if ('cssRules' in sheet) {
                            try {
                                (0, util_1.toArray)(sheet.cssRules || []).forEach(function (item) {
                                    ret.push(item);
                                });
                            }
                            catch (e) {
                                console.error("Error while reading CSS rules from ".concat(sheet.href), e);
                            }
                        }
                    });
                    return ret;
                })];
        });
    });
}
function getWebFontRules(cssRules) {
    return cssRules
        .filter(function (rule) { return rule.type === CSSRule.FONT_FACE_RULE; })
        .filter(function (rule) { return (0, embed_resources_1.shouldEmbed)(rule.style.getPropertyValue('src')); });
}
function parseWebFontRules(node, options) {
    return __awaiter(this, void 0, void 0, function () {
        var styleSheets, cssRules;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (node.ownerDocument == null) {
                        throw new Error('Provided element is not within a Document');
                    }
                    styleSheets = (0, util_1.toArray)(node.ownerDocument.styleSheets);
                    return [4 /*yield*/, getCSSRules(styleSheets, options)];
                case 1:
                    cssRules = _a.sent();
                    return [2 /*return*/, getWebFontRules(cssRules)];
            }
        });
    });
}
function getWebFontCSS(node, options) {
    return __awaiter(this, void 0, void 0, function () {
        var rules, cssTexts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, parseWebFontRules(node, options)];
                case 1:
                    rules = _a.sent();
                    return [4 /*yield*/, Promise.all(rules.map(function (rule) {
                            var baseUrl = rule.parentStyleSheet ? rule.parentStyleSheet.href : null;
                            return (0, embed_resources_1.embedResources)(rule.cssText, baseUrl, options);
                        }))];
                case 2:
                    cssTexts = _a.sent();
                    return [2 /*return*/, cssTexts.join('\n')];
            }
        });
    });
}
exports.getWebFontCSS = getWebFontCSS;
function embedWebFonts(clonedNode, options) {
    return __awaiter(this, void 0, void 0, function () {
        var cssText, _a, _b, styleNode, sytleContent;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!(options.fontEmbedCSS != null)) return [3 /*break*/, 1];
                    _a = options.fontEmbedCSS;
                    return [3 /*break*/, 5];
                case 1:
                    if (!options.skipFonts) return [3 /*break*/, 2];
                    _b = null;
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, getWebFontCSS(clonedNode, options)];
                case 3:
                    _b = _c.sent();
                    _c.label = 4;
                case 4:
                    _a = _b;
                    _c.label = 5;
                case 5:
                    cssText = _a;
                    if (cssText) {
                        styleNode = document.createElement('style');
                        sytleContent = document.createTextNode(cssText);
                        styleNode.appendChild(sytleContent);
                        if (clonedNode.firstChild) {
                            clonedNode.insertBefore(styleNode, clonedNode.firstChild);
                        }
                        else {
                            clonedNode.appendChild(styleNode);
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
exports.embedWebFonts = embedWebFonts;
//# sourceMappingURL=embed-webfonts.js.map