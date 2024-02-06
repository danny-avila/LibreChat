import * as React from 'react';
import { fullWidthClassName, zeroRightClassName } from 'react-remove-scroll-bar/constants';
import { useMergeRefs } from 'use-callback-ref';
import { effectCar } from './medium';
const nothing = () => {
    return;
};
/**
 * Removes scrollbar from the page and contain the scroll within the Lock
 */
const RemoveScroll = React.forwardRef((props, parentRef) => {
    const ref = React.useRef(null);
    const [callbacks, setCallbacks] = React.useState({
        onScrollCapture: nothing,
        onWheelCapture: nothing,
        onTouchMoveCapture: nothing,
    });
    const { forwardProps, children, className, removeScrollBar, enabled, shards, sideCar, noIsolation, inert, allowPinchZoom, as: Container = 'div', ...rest } = props;
    const SideCar = sideCar;
    const containerRef = useMergeRefs([ref, parentRef]);
    const containerProps = {
        ...rest,
        ...callbacks,
    };
    return (React.createElement(React.Fragment, null,
        enabled && (React.createElement(SideCar, { sideCar: effectCar, removeScrollBar: removeScrollBar, shards: shards, noIsolation: noIsolation, inert: inert, setCallbacks: setCallbacks, allowPinchZoom: !!allowPinchZoom, lockRef: ref })),
        forwardProps ? (React.cloneElement(React.Children.only(children), {
            ...containerProps,
            ref: containerRef,
        })) : (React.createElement(Container, { ...containerProps, className: className, ref: containerRef }, children))));
});
RemoveScroll.defaultProps = {
    enabled: true,
    removeScrollBar: true,
    inert: false,
};
RemoveScroll.classNames = {
    fullWidth: fullWidthClassName,
    zeroRight: zeroRightClassName,
};
export { RemoveScroll };
