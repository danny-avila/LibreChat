import * as React from 'react';
const SideCar = ({ sideCar, ...rest }) => {
    if (!sideCar) {
        throw new Error('Sidecar: please provide `sideCar` property to import the right car');
    }
    const Target = sideCar.read();
    if (!Target) {
        throw new Error('Sidecar medium not found');
    }
    return React.createElement(Target, { ...rest });
};
SideCar.isSideCarExport = true;
export function exportSidecar(medium, exported) {
    medium.useMedium(exported);
    return SideCar;
}
