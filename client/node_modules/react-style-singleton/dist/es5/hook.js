"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.styleHookSingleton = void 0;
var tslib_1 = require("tslib");
var React = tslib_1.__importStar(require("react"));
var singleton_1 = require("./singleton");
/**
 * creates a hook to control style singleton
 * @see {@link styleSingleton} for a safer component version
 * @example
 * ```tsx
 * const useStyle = styleHookSingleton();
 * ///
 * useStyle('body { overflow: hidden}');
 */
var styleHookSingleton = function () {
    var sheet = (0, singleton_1.stylesheetSingleton)();
    return function (styles, isDynamic) {
        React.useEffect(function () {
            sheet.add(styles);
            return function () {
                sheet.remove();
            };
        }, [styles && isDynamic]);
    };
};
exports.styleHookSingleton = styleHookSingleton;
