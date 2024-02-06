import React, { Component } from 'react';
import { FlipperProps } from 'flip-toolkit/lib/types';
import { FlippedElementPositionsBeforeUpdateReturnVals } from 'flip-toolkit/lib/flip/getFlippedElementPositions/getFlippedElementPositionsBeforeUpdate/types';
declare class Flipper extends Component<FlipperProps> {
    static defaultProps: {
        applyTransformOrigin: boolean;
        element: string;
    };
    private inProgressAnimations;
    private flipCallbacks;
    private el?;
    getSnapshotBeforeUpdate(prevProps: FlipperProps): FlippedElementPositionsBeforeUpdateReturnVals | null;
    componentDidUpdate(prevProps: FlipperProps, _prevState: any, cachedData: FlippedElementPositionsBeforeUpdateReturnVals): void;
    render(): React.JSX.Element;
}
export default Flipper;
