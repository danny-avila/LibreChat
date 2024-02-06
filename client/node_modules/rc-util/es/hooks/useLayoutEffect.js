import * as React from 'react';
import canUseDom from "../Dom/canUseDom";

/**
 * Wrap `React.useLayoutEffect` which will not throw warning message in test env
 */
var useInternalLayoutEffect = process.env.NODE_ENV !== 'test' && canUseDom() ? React.useLayoutEffect : React.useEffect;
var useLayoutEffect = function useLayoutEffect(callback, deps) {
  var firstMountRef = React.useRef(true);
  useInternalLayoutEffect(function () {
    return callback(firstMountRef.current);
  }, deps);

  // We tell react that first mount has passed
  useInternalLayoutEffect(function () {
    firstMountRef.current = false;
    return function () {
      firstMountRef.current = true;
    };
  }, []);
};
export var useLayoutUpdateEffect = function useLayoutUpdateEffect(callback, deps) {
  useLayoutEffect(function (firstMount) {
    if (!firstMount) {
      return callback();
    }
  }, deps);
};
export default useLayoutEffect;