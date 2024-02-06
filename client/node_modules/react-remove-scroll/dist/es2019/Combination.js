import * as React from 'react';
import { RemoveScroll } from './UI';
import SideCar from './sidecar';
const ReactRemoveScroll = React.forwardRef((props, ref) => (React.createElement(RemoveScroll, { ...props, ref: ref, sideCar: SideCar })));
ReactRemoveScroll.classNames = RemoveScroll.classNames;
export default ReactRemoveScroll;
