import { __assign, __rest } from "tslib";
import * as React from 'react';
var SideCar = function (_a) {
    var sideCar = _a.sideCar, rest = __rest(_a, ["sideCar"]);
    if (!sideCar) {
        throw new Error('Sidecar: please provide `sideCar` property to import the right car');
    }
    var Target = sideCar.read();
    if (!Target) {
        throw new Error('Sidecar medium not found');
    }
    return React.createElement(Target, __assign({}, rest));
};
SideCar.isSideCarExport = true;
export function exportSidecar(medium, exported) {
    medium.useMedium(exported);
    return SideCar;
}
