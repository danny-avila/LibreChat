import { __assign } from "tslib";
import * as React from 'react';
import { useSidecar } from './hook';
// eslint-disable-next-line @typescript-eslint/ban-types
export function sidecar(importer, errorComponent) {
    var ErrorCase = function () { return errorComponent; };
    return function Sidecar(props) {
        var _a = useSidecar(importer, props.sideCar), Car = _a[0], error = _a[1];
        if (error && errorComponent) {
            return ErrorCase;
        }
        // @ts-expect-error type shenanigans
        return Car ? React.createElement(Car, __assign({}, props)) : null;
    };
}
