import { __assign } from "tslib";
import * as React from 'react';
import { RemoveScroll } from './UI';
import SideCar from './sidecar';
var ReactRemoveScroll = React.forwardRef(function (props, ref) { return (React.createElement(RemoveScroll, __assign({}, props, { ref: ref, sideCar: SideCar }))); });
ReactRemoveScroll.classNames = RemoveScroll.classNames;
export default ReactRemoveScroll;
