"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _setupTrackingContext = /*#__PURE__*/ _interop_require_default(require("./lib/setupTrackingContext"));
const _processTailwindFeatures = /*#__PURE__*/ _interop_require_default(require("./processTailwindFeatures"));
const _sharedState = require("./lib/sharedState");
const _findAtConfigPath = require("./lib/findAtConfigPath");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
module.exports = function tailwindcss(configOrPath) {
    return {
        postcssPlugin: "tailwindcss",
        plugins: [
            _sharedState.env.DEBUG && function(root) {
                console.log("\n");
                console.time("JIT TOTAL");
                return root;
            },
            async function(root, result) {
                var _findAtConfigPath1;
                // Use the path for the `@config` directive if it exists, otherwise use the
                // path for the file being processed
                configOrPath = (_findAtConfigPath1 = (0, _findAtConfigPath.findAtConfigPath)(root, result)) !== null && _findAtConfigPath1 !== void 0 ? _findAtConfigPath1 : configOrPath;
                let context = (0, _setupTrackingContext.default)(configOrPath);
                if (root.type === "document") {
                    let roots = root.nodes.filter((node)=>node.type === "root");
                    for (const root of roots){
                        if (root.type === "root") {
                            await (0, _processTailwindFeatures.default)(context)(root, result);
                        }
                    }
                    return;
                }
                await (0, _processTailwindFeatures.default)(context)(root, result);
            },
            false && function lightningCssPlugin(_root, result) {
                let postcss = require("postcss");
                let lightningcss = require("lightningcss");
                let browserslist = require("browserslist");
                try {
                    let transformed = lightningcss.transform({
                        filename: result.opts.from,
                        code: Buffer.from(result.root.toString()),
                        minify: false,
                        sourceMap: !!result.map,
                        inputSourceMap: result.map ? result.map.toString() : undefined,
                        targets: typeof process !== "undefined" && process.env.JEST_WORKER_ID ? {
                            chrome: 106 << 16
                        } : lightningcss.browserslistToTargets(browserslist(require("../package.json").browserslist)),
                        drafts: {
                            nesting: true,
                            customMedia: true
                        }
                    });
                    var _result_map;
                    result.map = Object.assign((_result_map = result.map) !== null && _result_map !== void 0 ? _result_map : {}, {
                        toJSON () {
                            return transformed.map.toJSON();
                        },
                        toString () {
                            return transformed.map.toString();
                        }
                    });
                    result.root = postcss.parse(transformed.code.toString("utf8"));
                } catch (err) {
                    if (typeof process !== "undefined" && process.env.JEST_WORKER_ID) {
                        let lines = err.source.split("\n");
                        err = new Error([
                            "Error formatting using Lightning CSS:",
                            "",
                            ...[
                                "```css",
                                ...lines.slice(Math.max(err.loc.line - 3, 0), err.loc.line),
                                " ".repeat(err.loc.column - 1) + "^-- " + err.toString(),
                                ...lines.slice(err.loc.line, err.loc.line + 2),
                                "```"
                            ]
                        ].join("\n"));
                    }
                    if (Error.captureStackTrace) {
                        Error.captureStackTrace(err, lightningCssPlugin);
                    }
                    throw err;
                }
            },
            _sharedState.env.DEBUG && function(root) {
                console.timeEnd("JIT TOTAL");
                console.log("\n");
                return root;
            }
        ].filter(Boolean)
    };
};
module.exports.postcss = true;
