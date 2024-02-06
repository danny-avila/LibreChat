import * as React from 'react';
import { useState, useCallback, useEffect, useLayoutEffect } from 'react';
export function renderCar(WrappedComponent, defaults) {
    function State({ stateRef, props }) {
        const renderTarget = useCallback(function SideTarget(...args) {
            useLayoutEffect(() => {
                stateRef.current(args);
            });
            return null;
        }, []);
        // @ts-ignore
        return React.createElement(WrappedComponent, { ...props, children: renderTarget });
    }
    const Children = React.memo(({ stateRef, defaultState, children }) => {
        const [state, setState] = useState(defaultState.current);
        useEffect(() => {
            stateRef.current = setState;
        }, []);
        return children(...state);
    }, () => true);
    return function Combiner(props) {
        const defaultState = React.useRef(defaults(props));
        const ref = React.useRef((state) => (defaultState.current = state));
        return (React.createElement(React.Fragment, null,
            React.createElement(State, { stateRef: ref, props: props }),
            React.createElement(Children, { stateRef: ref, defaultState: defaultState, children: props.children })));
    };
}
