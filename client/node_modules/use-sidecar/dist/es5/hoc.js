"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sidecar = void 0;
var tslib_1 = require("tslib");
var React = tslib_1.__importStar(require("react"));
var hook_1 = require("./hook");
// eslint-disable-next-line @typescript-eslint/ban-types
function sidecar(importer, errorComponent) {
    var ErrorCase = function () { return errorComponent; };
    return function Sidecar(props) {
        var _a = (0, hook_1.useSidecar)(importer, props.sideCar), Car = _a[0], error = _a[1];
        if (error && errorComponent) {
            return ErrorCase;
        }
        // @ts-expect-error type shenanigans
        return Car ? React.createElement(Car, tslib_1.__assign({}, props)) : null;
    };
}
exports.sidecar = sidecar;
