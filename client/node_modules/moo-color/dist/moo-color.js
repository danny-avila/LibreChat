(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["MooColor"] = factory();
	else
		root["MooColor"] = factory();
})(this, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./node_modules/color-name/index.js":
/*!******************************************!*\
  !*** ./node_modules/color-name/index.js ***!
  \******************************************/
/***/ ((module) => {



module.exports = {
	"aliceblue": [240, 248, 255],
	"antiquewhite": [250, 235, 215],
	"aqua": [0, 255, 255],
	"aquamarine": [127, 255, 212],
	"azure": [240, 255, 255],
	"beige": [245, 245, 220],
	"bisque": [255, 228, 196],
	"black": [0, 0, 0],
	"blanchedalmond": [255, 235, 205],
	"blue": [0, 0, 255],
	"blueviolet": [138, 43, 226],
	"brown": [165, 42, 42],
	"burlywood": [222, 184, 135],
	"cadetblue": [95, 158, 160],
	"chartreuse": [127, 255, 0],
	"chocolate": [210, 105, 30],
	"coral": [255, 127, 80],
	"cornflowerblue": [100, 149, 237],
	"cornsilk": [255, 248, 220],
	"crimson": [220, 20, 60],
	"cyan": [0, 255, 255],
	"darkblue": [0, 0, 139],
	"darkcyan": [0, 139, 139],
	"darkgoldenrod": [184, 134, 11],
	"darkgray": [169, 169, 169],
	"darkgreen": [0, 100, 0],
	"darkgrey": [169, 169, 169],
	"darkkhaki": [189, 183, 107],
	"darkmagenta": [139, 0, 139],
	"darkolivegreen": [85, 107, 47],
	"darkorange": [255, 140, 0],
	"darkorchid": [153, 50, 204],
	"darkred": [139, 0, 0],
	"darksalmon": [233, 150, 122],
	"darkseagreen": [143, 188, 143],
	"darkslateblue": [72, 61, 139],
	"darkslategray": [47, 79, 79],
	"darkslategrey": [47, 79, 79],
	"darkturquoise": [0, 206, 209],
	"darkviolet": [148, 0, 211],
	"deeppink": [255, 20, 147],
	"deepskyblue": [0, 191, 255],
	"dimgray": [105, 105, 105],
	"dimgrey": [105, 105, 105],
	"dodgerblue": [30, 144, 255],
	"firebrick": [178, 34, 34],
	"floralwhite": [255, 250, 240],
	"forestgreen": [34, 139, 34],
	"fuchsia": [255, 0, 255],
	"gainsboro": [220, 220, 220],
	"ghostwhite": [248, 248, 255],
	"gold": [255, 215, 0],
	"goldenrod": [218, 165, 32],
	"gray": [128, 128, 128],
	"green": [0, 128, 0],
	"greenyellow": [173, 255, 47],
	"grey": [128, 128, 128],
	"honeydew": [240, 255, 240],
	"hotpink": [255, 105, 180],
	"indianred": [205, 92, 92],
	"indigo": [75, 0, 130],
	"ivory": [255, 255, 240],
	"khaki": [240, 230, 140],
	"lavender": [230, 230, 250],
	"lavenderblush": [255, 240, 245],
	"lawngreen": [124, 252, 0],
	"lemonchiffon": [255, 250, 205],
	"lightblue": [173, 216, 230],
	"lightcoral": [240, 128, 128],
	"lightcyan": [224, 255, 255],
	"lightgoldenrodyellow": [250, 250, 210],
	"lightgray": [211, 211, 211],
	"lightgreen": [144, 238, 144],
	"lightgrey": [211, 211, 211],
	"lightpink": [255, 182, 193],
	"lightsalmon": [255, 160, 122],
	"lightseagreen": [32, 178, 170],
	"lightskyblue": [135, 206, 250],
	"lightslategray": [119, 136, 153],
	"lightslategrey": [119, 136, 153],
	"lightsteelblue": [176, 196, 222],
	"lightyellow": [255, 255, 224],
	"lime": [0, 255, 0],
	"limegreen": [50, 205, 50],
	"linen": [250, 240, 230],
	"magenta": [255, 0, 255],
	"maroon": [128, 0, 0],
	"mediumaquamarine": [102, 205, 170],
	"mediumblue": [0, 0, 205],
	"mediumorchid": [186, 85, 211],
	"mediumpurple": [147, 112, 219],
	"mediumseagreen": [60, 179, 113],
	"mediumslateblue": [123, 104, 238],
	"mediumspringgreen": [0, 250, 154],
	"mediumturquoise": [72, 209, 204],
	"mediumvioletred": [199, 21, 133],
	"midnightblue": [25, 25, 112],
	"mintcream": [245, 255, 250],
	"mistyrose": [255, 228, 225],
	"moccasin": [255, 228, 181],
	"navajowhite": [255, 222, 173],
	"navy": [0, 0, 128],
	"oldlace": [253, 245, 230],
	"olive": [128, 128, 0],
	"olivedrab": [107, 142, 35],
	"orange": [255, 165, 0],
	"orangered": [255, 69, 0],
	"orchid": [218, 112, 214],
	"palegoldenrod": [238, 232, 170],
	"palegreen": [152, 251, 152],
	"paleturquoise": [175, 238, 238],
	"palevioletred": [219, 112, 147],
	"papayawhip": [255, 239, 213],
	"peachpuff": [255, 218, 185],
	"peru": [205, 133, 63],
	"pink": [255, 192, 203],
	"plum": [221, 160, 221],
	"powderblue": [176, 224, 230],
	"purple": [128, 0, 128],
	"rebeccapurple": [102, 51, 153],
	"red": [255, 0, 0],
	"rosybrown": [188, 143, 143],
	"royalblue": [65, 105, 225],
	"saddlebrown": [139, 69, 19],
	"salmon": [250, 128, 114],
	"sandybrown": [244, 164, 96],
	"seagreen": [46, 139, 87],
	"seashell": [255, 245, 238],
	"sienna": [160, 82, 45],
	"silver": [192, 192, 192],
	"skyblue": [135, 206, 235],
	"slateblue": [106, 90, 205],
	"slategray": [112, 128, 144],
	"slategrey": [112, 128, 144],
	"snow": [255, 250, 250],
	"springgreen": [0, 255, 127],
	"steelblue": [70, 130, 180],
	"tan": [210, 180, 140],
	"teal": [0, 128, 128],
	"thistle": [216, 191, 216],
	"tomato": [255, 99, 71],
	"turquoise": [64, 224, 208],
	"violet": [238, 130, 238],
	"wheat": [245, 222, 179],
	"white": [255, 255, 255],
	"whitesmoke": [245, 245, 245],
	"yellow": [255, 255, 0],
	"yellowgreen": [154, 205, 50]
};


/***/ }),

/***/ "./src/color-converter.ts":
/*!********************************!*\
  !*** ./src/color-converter.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "cmykToRgb": () => (/* binding */ cmykToRgb),
/* harmony export */   "hexToRgb": () => (/* binding */ hexToRgb),
/* harmony export */   "hslToRgb": () => (/* binding */ hslToRgb),
/* harmony export */   "hsvToHwb": () => (/* binding */ hsvToHwb),
/* harmony export */   "hsvToRgb": () => (/* binding */ hsvToRgb),
/* harmony export */   "hwbToHsv": () => (/* binding */ hwbToHsv),
/* harmony export */   "hwbToRgb": () => (/* binding */ hwbToRgb),
/* harmony export */   "resolveHwb": () => (/* binding */ resolveHwb),
/* harmony export */   "rgbToCmyk": () => (/* binding */ rgbToCmyk),
/* harmony export */   "rgbToHex": () => (/* binding */ rgbToHex),
/* harmony export */   "rgbToHsl": () => (/* binding */ rgbToHsl),
/* harmony export */   "rgbToHsv": () => (/* binding */ rgbToHsv),
/* harmony export */   "rgbToHwb": () => (/* binding */ rgbToHwb)
/* harmony export */ });
/* harmony import */ var _util_util__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./util/util */ "./src/util/util.ts");

/**
 * Converts an HSL to RGB.
 * @see https://www.rapidtables.com/convert/color/hsl-to-rgb.html
 * @export
 * @param {number} h hue
 * @param {number} s saturation 0-100
 * @param {number} l lightness 0-100
 * @returns {number[]} [red, green, blue] 0-255
 */
function hslToRgb(h, s, l) {
    h /= 60, s /= 100, l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(h % 2 - 1));
    var m = l - c / 2;
    var r;
    var g;
    var b;
    switch (Math.floor(h)) {
        case 0:
            r = c, g = x, b = 0;
            break;
        case 1:
            r = x, g = c, b = 0;
            break;
        case 2:
            r = 0, g = c, b = x;
            break;
        case 3:
            r = 0, g = x, b = c;
            break;
        case 4:
            r = x, g = 0, b = c;
            break;
        case 5:
            r = c, g = 0, b = x;
            break;
    }
    return [r, g, b].map(function (val) { return (val + m) * 255; });
}
/**
 * Converts RGB to HSL.
 * @see https://www.rapidtables.com/convert/color/rgb-to-hsl.html
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @returns {number[]} [hue, saturation, lightness] (0-360, 0-100, 0-100)
 */
function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var delta = max - min;
    var h;
    if (delta === 0) {
        h = 0;
    }
    else if (max === r) {
        h = 60 * ((g - b) / delta % 6);
    }
    else if (max === g) {
        h = 60 * ((b - r) / delta + 2);
    }
    else {
        h = 60 * ((r - g) / delta + 4);
    }
    var l = (max + min) / 2;
    var s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return [h, s * 100, l * 100];
}
/**
 * Converts HWB to RGB.
 * @export
 * @param {number} hue hue 0-360
 * @param {number} white whiteness 0-100
 * @param {number} black blackness 0-100
 * @returns {number[]} [red, green, blue] 0-255
 */
function hwbToRgb(hue, white, black) {
    var _a = hwbToHsv(hue, white, black), h = _a[0], s = _a[1], v = _a[2];
    return hsvToRgb(h, s, v);
}
/**
 * Converts RGB to HWB.
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @returns {number[]} [hue, whiteness, blackness] (0-360, 0-100, 0-100)
 */
function rgbToHwb(r, g, b) {
    var _a = rgbToHsv(r, g, b), h = _a[0], s = _a[1], v = _a[2];
    return hsvToHwb(h, s, v);
}
/**
 * Converts CMYK to RGB.
 * @see https://www.rapidtables.com/convert/color/cmyk-to-rgb.html
 * @export
 * @param {number} c cyan 0-100
 * @param {number} m magenta 0-100
 * @param {number} y yellow 0-100
 * @param {number} k black 0-100
 * @returns {number[]} [red, green, blue] 0-255
 */
function cmykToRgb(c, m, y, k) {
    c /= 100, m /= 100, y /= 100, k /= 100;
    var red = 255 * (1 - c) * (1 - k);
    var green = 255 * (1 - m) * (1 - k);
    var blue = 255 * (1 - y) * (1 - k);
    return [red, green, blue];
}
/**
 * Converts RGB to CMYK
 * @see https://www.rapidtables.com/convert/color/rgb-to-cmyk.html
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @returns {number[]} [cyan, magenta, yellow, black] 0-100
 */
function rgbToCmyk(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var k = 1 - Math.max(r, g, b);
    var c = (1 - r - k) / (1 - k);
    var m = (1 - g - k) / (1 - k);
    var y = (1 - b - k) / (1 - k);
    return [c, m, y, k].map(function (x) { return x * 100; });
}
/**
 * Converts HSV to RGB.
 * @see https://www.rapidtables.com/convert/color/hsv-to-rgb.html
 * @export
 * @param {number} h hue 0-360
 * @param {number} s saturation 0-100
 * @param {number} v value 0-100
 * @returns {number[]} [red, green, blue] 0-255
 */
function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    var r;
    var g;
    var b;
    var i = h / 60;
    var c = v * s;
    var x = c * (1 - Math.abs(i % 2 - 1));
    var m = v - c;
    switch (Math.floor(i)) {
        case 0:
            r = c, g = x, b = 0;
            break;
        case 1:
            r = x, g = c, b = 0;
            break;
        case 2:
            r = 0, g = c, b = x;
            break;
        case 3:
            r = 0, g = x, b = c;
            break;
        case 4:
            r = x, g = 0, b = c;
            break;
        case 5:
            r = c, g = 0, b = x;
            break;
    }
    return [r, g, b].map(function (val) { return (val + m) * 255; });
}
/**
 * Converts RGB to HSV.
 * @see https://www.rapidtables.com/convert/color/rgb-to-hsv.html
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @returns {number[]} [hue, saturation, value] (0-360, 0-100, 0-100)
 */
function rgbToHsv(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var h;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var delta = max - min;
    if (delta === 0) {
        h = 0;
    }
    else if (max === r) {
        h = 60 * ((g - b) / delta % 6);
    }
    else if (max === g) {
        h = 60 * ((b - r) / delta + 2);
    }
    else {
        h = 60 * ((r - g) / delta + 4);
    }
    var s = max === 0 ? 0 : delta / max;
    var v = max;
    return [h, s * 100, v * 100];
}
/**
 * Converts HSV to HWB
 * @see https://en.wikipedia.org/wiki/HWB_color_model
 * @export
 * @param {number} h hue 0-360
 * @param {number} s saturation 0-100
 * @param {number} v value 0-100
 * @returns {number[]} [hue, whiteness, blackness] (0-360, 0-100, 0-100)
 */
function hsvToHwb(h, s, v) {
    s /= 100, v /= 100;
    var white = (1 - s) * v;
    var black = 1 - v;
    return [h, white * 100, black * 100];
}
/**
 * Converts HWB to HSV.
 * @see https://en.wikipedia.org/wiki/HWB_color_model
 * @export
 * @param {number} h hue 0-360
 * @param {number} w whiteness 0-100
 * @param {number} b blackness 0-100
 * @returns {number[]} [hue, saturation, value] (0-360, 0-100, 0-100)
 */
function hwbToHsv(h, w, b) {
    var _a;
    _a = resolveHwb(h, w, b), h = _a[0], w = _a[1], b = _a[2];
    w /= 100, b /= 100;
    var s = 1 - w / (1 - b);
    var v = 1 - b;
    return [h, s * 100, v * 100];
}
/**
 * Converts RGB to HEX string.
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @param {(number|null)} [a] alpha 0-1 or null
 * @param {boolean} [enableShort] enable shorthand, default is false.
 * @returns {string} Hex string. e.g. 'ff0000'
 */
function rgbToHex(r, g, b, a, enableShort) {
    var arr = [r, g, b];
    if (typeof a === 'number') {
        arr.push(Math.round(a * 255));
    }
    var hex = arr.map(function (x) { return (0,_util_util__WEBPACK_IMPORTED_MODULE_0__.padStart)(x.toString(16), 2, '0'); }).join('');
    return enableShort ? hexToShorthand(hex) : hex;
}
function hexToShorthand(hex) {
    var check = true;
    var rgb = hex.match(/.{2}/g);
    rgb.forEach(function (x) {
        if (!x.match(/(.)\1+/)) {
            check = false;
        }
    });
    return check ? rgb.map(function (x) { return x.substring(1); }).join('') : hex;
}
/**
 * Converts HEX string to RGB.
 * @export
 * @param {string} hex hex string. e.g. 'ff0000', 'f00', 'ff000080'
 * @returns {number[]} [red, green, blue, alpha?] (rgb: 0-255, alpha: 0-1)
 */
function hexToRgb(hex) {
    var short = /^#?([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i;
    return hex.replace(short, function (m, r, g, b, a) {
        a = typeof a === 'undefined' ? '' : a;
        return r + r + g + g + b + b + a + a;
    })
        .match(/.{2}/g)
        .map(function (x, i) { return i !== 3 ? parseInt(x, 16) : parseInt(x, 16) / 255; });
}
/**
 * Resolve HWB values.
 * @see https://drafts.csswg.org/css-color/#the-hwb-notation
 * @export
 * @param {number} h hue 0-360
 * @param {number} w whiteness 0-100
 * @param {number} b blackness 0-100
 * @returns {number[]} [hue, whiteness, blackness]
 */
function resolveHwb(h, w, b) {
    var total = w + b;
    if (total > 100) {
        w = Number((w / total).toFixed(4)) * 100;
        b = Number((b / total).toFixed(4)) * 100;
    }
    return [h, w, b];
}


/***/ }),

/***/ "./src/color-formatter.ts":
/*!********************************!*\
  !*** ./src/color-formatter.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "ColorFormatter": () => (/* binding */ ColorFormatter),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _color_converter__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./color-converter */ "./src/color-converter.ts");
/* harmony import */ var _color_names__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./color-names */ "./src/color-names.ts");
/* harmony import */ var _util_util__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./util/util */ "./src/util/util.ts");



var ColorFormatter = /** @class */ (function () {
    function ColorFormatter() {
        // In hwb model, whiteness and blackness value's adjust will required.
        this.resolveHwb = _color_converter__WEBPACK_IMPORTED_MODULE_0__.resolveHwb;
    }
    ColorFormatter.prototype.setColor = function (color) {
        color.alpha = (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.resolveAlpha)(color.alpha);
        this.color = color;
        return this;
    };
    ColorFormatter.prototype.getColor = function () {
        return this.color;
    };
    ColorFormatter.prototype.getColorAs = function (model) {
        return this.color.model === model
            ? this.color
            : this.convert(this.color, model);
    };
    ColorFormatter.prototype.getModel = function () {
        return this.color ? this.color.model : undefined;
    };
    ColorFormatter.prototype.changeModel = function (model) {
        return this.color.model === model
            ? this
            : this.setColor(this.convert(this.color, model));
    };
    ColorFormatter.prototype.getAlpha = function () {
        return this.color.alpha;
    };
    ColorFormatter.prototype.setAlpha = function (alpha) {
        this.color.alpha = alpha;
        return this;
    };
    ColorFormatter.prototype.convert = function (color, model) {
        var values;
        switch (color.model) {
            case 'rgb':
                values = this.convertFromRgb(color.values, model);
                break;
            case 'hwb':
                values = this.convertFromHwb(color.values, model);
                break;
            case 'hsl':
                values = this.convertFromHsl(color.values, model);
                break;
            case 'hsv':
                values = this.convertFromHsv(color.values, model);
                break;
            case 'cmyk':
                values = this.convertFromCmyk(color.values, model);
                break;
        }
        if (!values.length) {
            throw new Error('Converting Error!');
        }
        return { model: model, values: values, alpha: color.alpha };
    };
    /**
     * Represents color as notation of specific color model.
     *
     * @param {(AcceptedModel|'hex')} [model] - Specify color model.
     * If not specifying this value, then returns current color model.
     * @param {...any[]} args - Arguments for the represent methods.
     * @returns {string}
     */
    ColorFormatter.prototype.toString = function (model) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        model = model ? model : this.color.model;
        switch (model) {
            case 'hex': return this.toHex.apply(this, args);
            case 'hwb': return this.toHwb();
            case 'hsl': return this.toHsl();
            case 'hsv': return this.toHsv();
            case 'cmyk': return this.toCmyk();
            default: return this.toRgb.apply(this, args);
        }
    };
    /**
     * Represents color as HEX notation.
     * @see https://www.w3.org/TR/css-color-4/#hex-notation
     *
     * @param {HexMode} [mode='full'] 'full'|'short'|'name'
     * @returns {string}
     */
    ColorFormatter.prototype.toHex = function (mode) {
        if (mode === void 0) { mode = 'full'; }
        var color = this.getColorAs('rgb');
        var _a = color.values.map(function (x) { return Math.round(x); }), r = _a[0], g = _a[1], b = _a[2];
        var a = color.alpha === 1 ? null : color.alpha;
        var nameOrShort = function () {
            var name = '';
            for (var _i = 0, _a = Object.keys(_color_names__WEBPACK_IMPORTED_MODULE_1__["default"]); _i < _a.length; _i++) {
                var key = _a[_i];
                if ((0,_util_util__WEBPACK_IMPORTED_MODULE_2__.arrayIsEqual)(_color_names__WEBPACK_IMPORTED_MODULE_1__["default"][key], [r, g, b])) {
                    name = key;
                    break;
                }
            }
            return a === null && name !== '' ? name : "#".concat(_color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHex(r, g, b, a, true));
        };
        switch (mode) {
            case 'name': return nameOrShort();
            case 'short': return "#".concat(_color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHex(r, g, b, a, true));
            case 'full':
            default: return "#".concat(_color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHex(r, g, b, a));
        }
    };
    /**
     * Represents color as RGB notation.
     * @see https://www.w3.org/TR/css-color-4/#rgb-functions
     *
     * @param {RgbMode} [mode='default'] 'default'|'percent'
     * @returns {string}
     */
    ColorFormatter.prototype.toRgb = function (mode) {
        var _a;
        if (mode === void 0) { mode = 'default'; }
        var color = this.getColorAs('rgb');
        var _b = color.values.map(function (x) { return Math.round(x); }), r = _b[0], g = _b[1], b = _b[2];
        if (mode === 'percent') {
            _a = [r, g, b].map(function (x) { return "".concat(x / 255 * 100, "%"); }), r = _a[0], g = _a[1], b = _a[2];
        }
        return color.alpha === 1
            ? "rgb(".concat(r, ", ").concat(g, ", ").concat(b, ")")
            : "rgba(".concat(r, ", ").concat(g, ", ").concat(b, ", ").concat(color.alpha, ")");
    };
    /**
     * Represents color as HWB notation.
     * @see https://www.w3.org/TR/css-color-4/#the-hwb-notation
     * @returns {string} e.g. 'hwb(0, 0%, 0%, 0)'
     */
    ColorFormatter.prototype.toHwb = function () {
        var color = this.getColorAs('hwb');
        var _a = color.values.map(function (x) { return (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.decimal)(x, 2); }), h = _a[0], w = _a[1], b = _a[2];
        var a = color.alpha === 1 ? '' : ", ".concat(color.alpha);
        return "hwb(".concat(h, ", ").concat(w, "%, ").concat(b, "%").concat(a, ")");
    };
    /**
     * Represents color as HSL notation.
     * @see https://www.w3.org/TR/css-color-4/#the-hsl-notation
     * @returns {string}
     */
    ColorFormatter.prototype.toHsl = function () {
        var color = this.getColorAs('hsl');
        var _a = color.values.map(function (x) { return (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.decimal)(x, 2); }), h = _a[0], s = _a[1], l = _a[2];
        return color.alpha === 1
            ? "hsl(".concat(h, ", ").concat(s, "%, ").concat(l, "%)")
            : "hsla(".concat(h, ", ").concat(s, "%, ").concat(l, "%, ").concat(color.alpha, ")");
    };
    /**
     * Represents color as HSV notation. This format is similar to HSL.
     * @returns {string}
     */
    ColorFormatter.prototype.toHsv = function () {
        var color = this.getColorAs('hsv');
        var _a = color.values.map(function (x) { return (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.decimal)(x, 2); }), h = _a[0], s = _a[1], v = _a[2];
        return color.alpha === 1
            ? "hsv(".concat(h, ", ").concat(s, "%, ").concat(v, "%)")
            : "hsva(".concat(h, ", ").concat(s, "%, ").concat(v, "%, ").concat(color.alpha, ")");
    };
    /**
     * Represents color as CMYK notation. e.g. 'cmyk(0%, 0%, 0%, 0%)'
     * @see https://www.w3.org/TR/css-color-4/#cmyk-colors
     * @returns {string}
     */
    ColorFormatter.prototype.toCmyk = function () {
        var color = this.getColorAs('cmyk');
        var _a = color.values.map(function (x) { return (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.decimal)(x, 2); }), c = _a[0], m = _a[1], y = _a[2], k = _a[3];
        var a = color.alpha === 1 ? '' : ", ".concat(color.alpha);
        return "cmyk(".concat(c, "%, ").concat(m, "%, ").concat(y, "%, ").concat(k, "%").concat(a, ")");
    };
    ColorFormatter.prototype.convertFromRgb = function (_a, model) {
        var r = _a[0], g = _a[1], b = _a[2];
        switch (model) {
            case 'rgb': return [r, g, b];
            case 'hwb': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHwb(r, g, b);
            case 'hsl': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHsl(r, g, b);
            case 'hsv': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHsv(r, g, b);
            case 'cmyk': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToCmyk(r, g, b);
        }
    };
    ColorFormatter.prototype.convertFromHwb = function (_a, model) {
        var h = _a[0], w = _a[1], b = _a[2];
        var _b = _color_converter__WEBPACK_IMPORTED_MODULE_0__.hwbToRgb(h, w, b), red = _b[0], green = _b[1], blue = _b[2];
        switch (model) {
            case 'rgb': return [red, green, blue];
            case 'hwb': return [h, w, b];
            case 'hsl': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHsl(red, green, blue);
            case 'hsv': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.hwbToHsv(h, w, b);
            case 'cmyk': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToCmyk(red, green, blue);
        }
    };
    ColorFormatter.prototype.convertFromHsl = function (_a, model) {
        var h = _a[0], s = _a[1], l = _a[2];
        var _b = _color_converter__WEBPACK_IMPORTED_MODULE_0__.hslToRgb(h, s, l), red = _b[0], green = _b[1], blue = _b[2];
        switch (model) {
            case 'rgb': return [red, green, blue];
            case 'hwb': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHwb(red, green, blue);
            case 'hsl': return [h, s, l];
            case 'hsv': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHsv(red, green, blue);
            case 'cmyk': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToCmyk(red, green, blue);
        }
    };
    ColorFormatter.prototype.convertFromHsv = function (_a, model) {
        var h = _a[0], s = _a[1], v = _a[2];
        var _b = _color_converter__WEBPACK_IMPORTED_MODULE_0__.hsvToRgb(h, s, v), red = _b[0], green = _b[1], blue = _b[2];
        switch (model) {
            case 'rgb': return [red, green, blue];
            case 'hwb': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.hsvToHwb(h, s, v);
            case 'hsl': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHsl(red, green, blue);
            case 'hsv': return [h, s, v];
            case 'cmyk': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToCmyk(red, green, blue);
        }
    };
    ColorFormatter.prototype.convertFromCmyk = function (_a, model) {
        var c = _a[0], m = _a[1], y = _a[2], k = _a[3];
        var _b = _color_converter__WEBPACK_IMPORTED_MODULE_0__.cmykToRgb(c, m, y, k), red = _b[0], green = _b[1], blue = _b[2];
        switch (model) {
            case 'rgb': return [red, green, blue];
            case 'hwb': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHwb(red, green, blue);
            case 'hsl': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHsl(red, green, blue);
            case 'hsv': return _color_converter__WEBPACK_IMPORTED_MODULE_0__.rgbToHsv(red, green, blue);
            case 'cmyk': return [c, m, y, k];
        }
    };
    return ColorFormatter;
}());

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ColorFormatter);


/***/ }),

/***/ "./src/color-names.ts":
/*!****************************!*\
  !*** ./src/color-names.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var color_name__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! color-name */ "./node_modules/color-name/index.js");
/* harmony import */ var color_name__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(color_name__WEBPACK_IMPORTED_MODULE_0__);

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (color_name__WEBPACK_IMPORTED_MODULE_0__);


/***/ }),

/***/ "./src/color.ts":
/*!**********************!*\
  !*** ./src/color.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);



/***/ }),

/***/ "./src/input-parser.ts":
/*!*****************************!*\
  !*** ./src/input-parser.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ inputParser)
/* harmony export */ });
/* harmony import */ var _color_converter__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./color-converter */ "./src/color-converter.ts");
/* harmony import */ var _color_names__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./color-names */ "./src/color-names.ts");
/* harmony import */ var _util_util__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./util/util */ "./src/util/util.ts");



function inputParser(input) {
    if (input in _color_names__WEBPACK_IMPORTED_MODULE_1__["default"]) {
        // Named colors.
        return {
            model: 'rgb',
            values: _color_names__WEBPACK_IMPORTED_MODULE_1__["default"][input],
            alpha: 1,
        };
    }
    else if (input === 'transparent') {
        // 'transparent'.
        return {
            model: 'rgb',
            values: [0, 0, 0],
            alpha: 0,
        };
    }
    else {
        // parse string.
        var prefix = input.substr(0, 3).toLowerCase();
        switch (prefix) {
            case 'hwb': return parseHwb(input);
            case 'hsl': return parseHsl(input);
            case 'hsv': return parseHsv(input);
            case 'cmy': return parseCmyk(input);
            default: return parseRgb(input);
        }
    }
}
function parseRgb(input) {
    var hex = /^#?([a-f0-9]{6})([a-f0-9]{2})?$/i;
    var shortHex = /^#?([a-f0-9]{3})([a-f0-9]{1})?$/i;
    var rgba = /^rgba?\s*\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/;
    // tslint:disable-next-line:max-line-length
    var percent = /^rgba?\s*\(\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/;
    var hexToAlpha = function (num) { return Math.round((parseInt(num, 16) / 255) * 100) / 100; };
    var values;
    var alpha;
    if (hex.test(input)) {
        var _a = input.match(hex), h = _a[1], a = _a[2];
        values = h.match(/.{2}/g).map(function (x) { return parseInt(x, 16); });
        alpha = a ? hexToAlpha(a) : 1;
    }
    else if (shortHex.test(input)) {
        var _b = input.match(shortHex), h = _b[1], a = _b[2];
        values = h.match(/.{1}/g).map(function (x) { return parseInt(x + x, 16); });
        alpha = a ? hexToAlpha(a) : 1;
    }
    else if (rgba.test(input)) {
        var _c = input.match(rgba), r = _c[1], g = _c[2], b = _c[3], a = _c[4];
        values = [r, g, b].map(function (x) { return parseInt(x, 0); });
        alpha = (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.resolveAlpha)(a);
    }
    else if (percent.test(input)) {
        var _d = input.match(percent), r = _d[1], g = _d[2], b = _d[3], a = _d[4];
        values = [r, g, b].map(function (x) { return Math.round(parseFloat(x) * 2.55); });
        alpha = (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.resolveAlpha)(a);
    }
    else {
        return null;
    }
    return {
        model: 'rgb',
        values: values.map(function (x) { return (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(x, 0, 255); }),
        alpha: (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(alpha, 0, 1),
    };
}
function parseHsl(input) {
    // tslint:disable-next-line:max-line-length
    var hsl = /^hsla?\s*\(\s*([+-]?\d*[.]?\d+)(?:deg)?\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/i;
    if (hsl.test(input)) {
        var _a = input.match(hsl), h = _a[1], s = _a[2], l = _a[3], a = _a[4];
        return {
            model: 'hsl',
            values: [
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.degree)(h),
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(s), 0, 100),
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(l), 0, 100),
            ],
            alpha: (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.resolveAlpha)(a),
        };
    }
    else {
        return null;
    }
}
function parseHwb(input) {
    // tslint:disable-next-line:max-line-length
    var hwb = /^hwba?\s*\(\s*([+-]?\d*[.]?\d+)(?:deg)?\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/i;
    if (hwb.test(input)) {
        var _a = input.match(hwb), h = _a[1], w = _a[2], b = _a[3], a = _a[4];
        return {
            model: 'hwb',
            values: (0,_color_converter__WEBPACK_IMPORTED_MODULE_0__.resolveHwb)((0,_util_util__WEBPACK_IMPORTED_MODULE_2__.degree)(h), (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(w), 0, 100), (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(b), 0, 100)),
            alpha: (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.resolveAlpha)(a),
        };
    }
    else {
        return null;
    }
}
function parseHsv(input) {
    // tslint:disable-next-line:max-line-length
    var hsv = /^hsva?\s*\(\s*([+-]?\d*[.]?\d+)(?:deg)?\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/i;
    if (hsv.test(input)) {
        var _a = input.match(hsv), h = _a[1], s = _a[2], v = _a[3], a = _a[4];
        return {
            model: 'hsv',
            values: [
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.degree)(h),
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(s), 0, 100),
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(v), 0, 100),
            ],
            alpha: (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.resolveAlpha)(a),
        };
    }
    else {
        return null;
    }
}
function parseCmyk(input) {
    // tslint:disable-next-line:max-line-length
    var cmyk = /^cmyk\s*\(\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/i;
    if (cmyk.test(input)) {
        var _a = input.match(cmyk), c = _a[1], m = _a[2], y = _a[3], k = _a[4], a = _a[5];
        return {
            model: 'cmyk',
            values: [
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(c), 0, 100),
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(m), 0, 100),
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(y), 0, 100),
                (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.clamp)(parseFloat(k), 0, 100),
            ],
            alpha: (0,_util_util__WEBPACK_IMPORTED_MODULE_2__.resolveAlpha)(a),
        };
    }
    else {
        return null;
    }
}


/***/ }),

/***/ "./src/util/util.ts":
/*!**************************!*\
  !*** ./src/util/util.ts ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "arrayIsEqual": () => (/* binding */ arrayIsEqual),
/* harmony export */   "clamp": () => (/* binding */ clamp),
/* harmony export */   "decimal": () => (/* binding */ decimal),
/* harmony export */   "degree": () => (/* binding */ degree),
/* harmony export */   "getRandom": () => (/* binding */ getRandom),
/* harmony export */   "padEnd": () => (/* binding */ padEnd),
/* harmony export */   "padStart": () => (/* binding */ padStart),
/* harmony export */   "resolveAlpha": () => (/* binding */ resolveAlpha)
/* harmony export */ });
function padStart(str, length, chars) {
    var space = length - str.length;
    return space > 0 ? "".concat(makePad(chars, space)).concat(str) : str;
}
function padEnd(str, length, chars) {
    var space = length - str.length;
    return space > 0 ? "".concat(str).concat(makePad(chars, space)) : str;
}
function makePad(chars, limit) {
    while (chars.length < limit) {
        chars += chars;
    }
    return chars.substring(0, limit);
}
function clamp(num, min, max) {
    return Math.min(Math.max(min, num), max);
}
function degree(num) {
    num = typeof num === 'string' ? parseFloat(num) : num;
    return (num % 360 + 360) % 360;
}
function resolveAlpha(a) {
    a = typeof a === 'string' ? parseFloat(a) : a;
    return clamp(isNaN(a) ? 1 : a, 0, 1);
}
// @see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round
function decimal(num, precision) {
    var factor = Math.pow(10, precision);
    return Math.round(num * factor) / factor;
}
function getRandom(min, max, precision) {
    if (precision === void 0) { precision = 0; }
    var num = Math.random() * (max - min) + min;
    return decimal(num, precision);
}
// https://stackoverflow.com/questions/7837456/how-to-compare-arrays-in-javascript#answer-19746771
function arrayIsEqual(arr1, arr2) {
    return arr1.length === arr2.length && arr1.every(function (v, i) {
        return Array.isArray(v) ? arrayIsEqual(v, arr2[i]) : v === arr2[i];
    });
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!**************************!*\
  !*** ./src/moo-color.ts ***!
  \**************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "ColorFormatter": () => (/* reexport safe */ _color_formatter__WEBPACK_IMPORTED_MODULE_1__["default"]),
/* harmony export */   "MooColor": () => (/* binding */ MooColor),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _color_converter__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./color-converter */ "./src/color-converter.ts");
/* harmony import */ var _color_formatter__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./color-formatter */ "./src/color-formatter.ts");
/* harmony import */ var _input_parser__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./input-parser */ "./src/input-parser.ts");
/* harmony import */ var _util_util__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./util/util */ "./src/util/util.ts");
/* harmony import */ var _color__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./color */ "./src/color.ts");
var __extends = (undefined && undefined.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();






var MooColor = /** @class */ (function (_super) {
    __extends(MooColor, _super);
    /**
     * Creates an instance of MooColor.
     * @param {(string|Color)} [color] color value. e.g. '#ff0000' 'rgba(255, 0, 0, .5)' 'hsl(120, 50%, 100%)'
     * @memberof MooColor
     */
    function MooColor(color) {
        var _this = _super.call(this) || this;
        if (typeof color === 'object' && color !== null) {
            _this.setColor(color);
        }
        else if (typeof color === 'string' || typeof color === 'undefined') {
            color = color ? color : '#000';
            _this.setColorByParser(color);
        }
        return _this;
    }
    MooColor.mix = function (color1, color2, percentOf1) {
        if (percentOf1 === void 0) { percentOf1 = 50; }
        var c1 = (color1 instanceof MooColor) ? color1 : new MooColor(color1);
        var c2 = (color2 instanceof MooColor) ? color2 : new MooColor(color2);
        return c2.mix(c1, percentOf1);
    };
    /**
     * Create random color as HWB color model.
     *
     * @static
     * @param {RandomArguments} [{hue, white, black}={}]
     * @returns {MooColor}
     * @memberof MooColor
     */
    MooColor.random = function (_a) {
        var _b;
        var _c = _a === void 0 ? {} : _a, hue = _c.hue, white = _c.white, black = _c.black;
        _b = [hue, white, black].map(function (x, i) {
            if (typeof x === 'number') {
                return x;
            }
            else if (Array.isArray(x)) {
                var precision = i === 0 ? 0 : 2;
                return (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.getRandom)(Math.min.apply(Math, x), Math.max.apply(Math, x), precision);
            }
            else {
                return i === 0 ? (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.getRandom)(0, 360) : (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.getRandom)(0, 100, 2);
            }
        }), hue = _b[0], white = _b[1], black = _b[2];
        return new MooColor({
            model: 'hwb',
            values: (0,_color_converter__WEBPACK_IMPORTED_MODULE_0__.resolveHwb)((0,_util_util__WEBPACK_IMPORTED_MODULE_3__.degree)(hue), (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.clamp)(white, 0, 100), (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.clamp)(black, 0, 100)),
            alpha: 1,
        });
    };
    MooColor.prototype.setColorByParser = function (str) {
        var color = (0,_input_parser__WEBPACK_IMPORTED_MODULE_2__["default"])(str);
        if (!color) {
            throw new Error('parsing error!');
        }
        return this.setColor(color);
    };
    MooColor.prototype.clone = function () {
        return new MooColor(this.color);
    };
    Object.defineProperty(MooColor.prototype, "brightness", {
        /**
         * Returns color brightness from 0 to 255. (It based RGB)
         * @see https://www.w3.org/TR/AERT/#color-contrast
         * @readonly
         * @type {number}
         */
        get: function () {
            var _a = this.getColorAs('rgb').values, r = _a[0], g = _a[1], b = _a[2];
            return ((r * 299) + (g * 587) + (b * 114)) / 1000;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(MooColor.prototype, "isLight", {
        /**
         * Returns whether color is light or not.
         * @readonly
         * @type {boolean}
         */
        get: function () {
            return this.brightness >= 128;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(MooColor.prototype, "isDark", {
        /**
         * Returns whether color is dark or not.
         * @readonly
         * @type {boolean}
         */
        get: function () {
            return this.brightness < 128;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(MooColor.prototype, "luminance", {
        /**
         * Returns luminance value of the color. value from 0 to 1.
         * @see https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
         * @readonly
         * @type {number}
         */
        get: function () {
            var _a = this.getColorAs('rgb').values.map(function (x) { return x / 255; }), r = _a[0], g = _a[1], b = _a[2];
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Returns contrast ratio with other color. range from 0 to 21.
     * @see https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
     * @param {MooColor} color
     * @returns {number} 0-21
     */
    MooColor.prototype.contrastRatioWith = function (color) {
        var max = Math.max(this.luminance, color.luminance);
        var min = Math.min(this.luminance, color.luminance);
        return (max + 0.05) / (min + 0.05);
    };
    /**
     * Return true if contrast ratio >= 4.5
     * @see https://www.w3.org/WAI/WCAG20/quickref/#qr-visual-audio-contrast-contrast
     * @param {MooColor} color
     * @returns {boolean}
     */
    MooColor.prototype.isContrastEnough = function (color) {
        return this.contrastRatioWith(color) >= 4.5;
    };
    /**
     * Increase lightness.
     * @param {number} amount The amount from 0 to 100.
     * @returns {this}
     */
    MooColor.prototype.lighten = function (amount) {
        return this.manipulate('hsl', function (h, s, l) {
            l = (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.clamp)(l + amount, 0, 100);
            return [h, s, l];
        });
    };
    /**
     * Decrease lightness.
     * @param {number} amount The amount from 0 to 100.
     * @returns {this}
     */
    MooColor.prototype.darken = function (amount) {
        return this.manipulate('hsl', function (h, s, l) {
            l = (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.clamp)(l - amount, 0, 100);
            return [h, s, l];
        });
    };
    /**
     * Increase saturation.
     * @param {number} amount The amount from 0 to 100.
     * @returns {this}
     */
    MooColor.prototype.saturate = function (amount) {
        return this.manipulate('hsl', function (h, s, l) {
            s = (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.clamp)(s + amount, 0, 100);
            return [h, s, l];
        });
    };
    /**
     * Decrease saturation.
     * @param {number} amount The amount from 0 to 100.
     * @returns {this}
     */
    MooColor.prototype.desaturate = function (amount) {
        return this.manipulate('hsl', function (h, s, l) {
            s = (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.clamp)(s - amount, 0, 100);
            return [h, s, l];
        });
    };
    /**
     * Sets saturation value to 0.
     * @returns {this}
     */
    MooColor.prototype.grayscale = function () {
        return this.manipulate('hsl', function (h, s, l) { return [h, 0, l]; });
    };
    /**
     * Modify whiteness.
     * @param {number} amount The amount from -100 to 100.
     * @returns {this}
     */
    MooColor.prototype.whiten = function (amount) {
        var _this = this;
        return this.manipulate('hwb', function (h, w, b) { return _this.resolveHwb(h, (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.clamp)(w + amount, 0, 100), b); });
    };
    /**
     * Modify blackness.
     * @param {number} amount The amount from -100 to 100.
     * @returns {this}
     */
    MooColor.prototype.blacken = function (amount) {
        var _this = this;
        return this.manipulate('hwb', function (h, w, b) { return _this.resolveHwb(h, w, (0,_util_util__WEBPACK_IMPORTED_MODULE_3__.clamp)(b + amount, 0, 100)); });
    };
    /**
     * Rotate hue value.
     * @param {number} d degree 0-360
     * @returns {this}
     */
    MooColor.prototype.rotate = function (d) {
        return this.manipulate('hsl', function (h, s, l) { return [(0,_util_util__WEBPACK_IMPORTED_MODULE_3__.degree)(h + d), s, l]; });
    };
    /**
     * Mix two colors.
     * @param {MooColor} color The color to mixed.
     * @param {number} [percent=50] The percentage value of color to be mixed.
     * @returns {MooColor} The mixed color that as a new instance of `MooColor`.
     */
    MooColor.prototype.mix = function (color, percent) {
        if (percent === void 0) { percent = 50; }
        percent /= 100;
        var m = this.getModel();
        var c1 = this.getColorAs('rgb');
        var c2 = color.getColorAs('rgb');
        return new MooColor({
            model: 'rgb',
            values: c1.values.map(function (v, i) { return v + (c2.values[i] - v) * percent; }),
            alpha: c1.alpha + (c2.alpha - c1.alpha) * percent,
        }).changeModel(m);
    };
    /**
     * Sets color to the complement of a color.
     *
     * @returns {this}
     */
    MooColor.prototype.complement = function () {
        return this.manipulate('hsl', function (h, s, l) { return [(0,_util_util__WEBPACK_IMPORTED_MODULE_3__.degree)(h + 180), s, l]; });
    };
    /**
     * Sets color to the inverse (negative) of a color.
     *
     * @param {number} [percent=100] The relative percent of the color that inverse.
     * @returns {this}
     */
    MooColor.prototype.invert = function (percent) {
        if (percent === void 0) { percent = 100; }
        percent /= 100;
        var absRound = function (x) { return Math.round(Math.abs(x)); };
        return this.manipulate('rgb', function (r, g, b) { return [r, g, b].map(function (x) { return absRound(255 * percent - x); }); });
    };
    MooColor.prototype.manipulate = function (asModel, callback) {
        var m = this.color.model;
        var color = this.getColorAs(asModel);
        color.values = callback.apply(void 0, color.values);
        return this.setColor(color).changeModel(m);
    };
    return MooColor;
}(_color_formatter__WEBPACK_IMPORTED_MODULE_1__["default"]));

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (MooColor);

})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=moo-color.js.map