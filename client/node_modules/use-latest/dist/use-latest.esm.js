import * as React from 'react';
import useIsomorphicLayoutEffect from 'use-isomorphic-layout-effect';

var useLatest = function useLatest(value) {
  var ref = React.useRef(value);
  useIsomorphicLayoutEffect(function () {
    ref.current = value;
  });
  return ref;
};

export { useLatest as default };
