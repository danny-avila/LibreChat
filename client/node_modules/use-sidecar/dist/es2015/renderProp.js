import { __assign } from "tslib";
import * as React from 'react';
import { useState, useCallback, useEffect, useLayoutEffect } from 'react';
export function renderCar(WrappedComponent, defaults) {
    function State(_a) {
        var stateRef = _a.stateRef, props = _a.props;
        var renderTarget = useCallback(function SideTarget() {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            useLayoutEffect(function () {
                stateRef.current(args);
            });
            return null;
        }, []);
        // @ts-ignore
        return React.createElement(WrappedComponent, __assign({}, props, { children: renderTarget }));
    }
    var Children = React.memo(function (_a) {
        var stateRef = _a.stateRef, defaultState = _a.defaultState, children = _a.children;
        var _b = useState(defaultState.current), state = _b[0], setState = _b[1];
        useEffect(function () {
            stateRef.current = setState;
        }, []);
        return children.apply(void 0, state);
    }, function () { return true; });
    return function Combiner(props) {
        var defaultState = React.useRef(defaults(props));
        var ref = React.useRef(function (state) { return (defaultState.current = state); });
        return (React.createElement(React.Fragment, null,
            React.createElement(State, { stateRef: ref, props: props }),
            React.createElement(Children, { stateRef: ref, defaultState: defaultState, children: props.children })));
    };
}
