"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    lazyLightningCss: function() {
        return lazyLightningCss;
    },
    lightningcss: function() {
        return lightningcss;
    },
    loadPostcss: function() {
        return loadPostcss;
    },
    loadPostcssImport: function() {
        return loadPostcssImport;
    }
});
const _packagejson = /*#__PURE__*/ _interop_require_default(require("../../../../package.json"));
const _browserslist = /*#__PURE__*/ _interop_require_default(require("browserslist"));
const _index = require("../../../../peers/index");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function lazyLightningCss() {
    // TODO: Make this lazy/bundled
    return require("lightningcss");
}
let lightningCss;
function loadLightningCss() {
    if (lightningCss) {
        return lightningCss;
    }
    // Try to load a local version first
    try {
        return lightningCss = require("lightningcss");
    } catch  {}
    return lightningCss = lazyLightningCss();
}
async function lightningcss(shouldMinify, result) {
    let css = loadLightningCss();
    try {
        let transformed = css.transform({
            filename: result.opts.from || "input.css",
            code: Buffer.from(result.css, "utf-8"),
            minify: shouldMinify,
            sourceMap: !!result.map,
            inputSourceMap: result.map ? result.map.toString() : undefined,
            targets: css.browserslistToTargets((0, _browserslist.default)(_packagejson.default.browserslist)),
            drafts: {
                nesting: true
            }
        });
        return Object.assign(result, {
            css: transformed.code.toString("utf8"),
            map: result.map ? Object.assign(result.map, {
                toString () {
                    return transformed.map.toString();
                }
            }) : result.map
        });
    } catch (err) {
        console.error("Unable to use Lightning CSS. Using raw version instead.");
        console.error(err);
        return result;
    }
}
function loadPostcss() {
    // Try to load a local `postcss` version first
    try {
        return require("postcss");
    } catch  {}
    return (0, _index.lazyPostcss)();
}
function loadPostcssImport() {
    // Try to load a local `postcss-import` version first
    try {
        return require("postcss-import");
    } catch  {}
    return (0, _index.lazyPostcssImport)();
}
