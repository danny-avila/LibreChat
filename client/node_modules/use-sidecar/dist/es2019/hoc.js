import * as React from 'react';
import { useSidecar } from './hook';
// eslint-disable-next-line @typescript-eslint/ban-types
export function sidecar(importer, errorComponent) {
    const ErrorCase = () => errorComponent;
    return function Sidecar(props) {
        const [Car, error] = useSidecar(importer, props.sideCar);
        if (error && errorComponent) {
            return ErrorCase;
        }
        // @ts-expect-error type shenanigans
        return Car ? React.createElement(Car, { ...props }) : null;
    };
}
