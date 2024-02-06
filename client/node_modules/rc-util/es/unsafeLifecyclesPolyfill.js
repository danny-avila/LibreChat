import React from 'react';
var unsafeLifecyclesPolyfill = function unsafeLifecyclesPolyfill(Component) {
  var prototype = Component.prototype;
  if (!prototype || !prototype.isReactComponent) {
    throw new Error('Can only polyfill class components');
  }

  // only handle componentWillReceiveProps
  if (typeof prototype.componentWillReceiveProps !== 'function') {
    return Component;
  }

  // In React 16.9, React.Profiler was introduced together with UNSAFE_componentWillReceiveProps
  // https://reactjs.org/blog/2019/08/08/react-v16.9.0.html#performance-measurements-with-reactprofiler
  if (!React.Profiler) {
    return Component;
  }

  // Here polyfill get started
  prototype.UNSAFE_componentWillReceiveProps = prototype.componentWillReceiveProps;
  delete prototype.componentWillReceiveProps;
  return Component;
};
export default unsafeLifecyclesPolyfill;