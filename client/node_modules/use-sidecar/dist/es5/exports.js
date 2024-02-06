"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportSidecar = void 0;
var tslib_1 = require("tslib");
var React = tslib_1.__importStar(require("react"));
var SideCar = function (_a) {
    var sideCar = _a.sideCar, rest = tslib_1.__rest(_a, ["sideCar"]);
    if (!sideCar) {
        throw new Error('Sidecar: please provide `sideCar` property to import the right car');
    }
    var Target = sideCar.read();
    if (!Target) {
        throw new Error('Sidecar medium not found');
    }
    return React.createElement(Target, tslib_1.__assign({}, rest));
};
SideCar.isSideCarExport = true;
function exportSidecar(medium, exported) {
    medium.useMedium(exported);
    return SideCar;
}
exports.exportSidecar = exportSidecar;
