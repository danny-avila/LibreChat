import * as React from 'react';

/** As `React.useEffect` but pass origin value in callback and not need care deps length change. */
export default function useEffect(callback, deps) {
  var prevRef = React.useRef(deps);
  React.useEffect(function () {
    if (deps.length !== prevRef.current.length || deps.some(function (dep, index) {
      return dep !== prevRef.current[index];
    })) {
      callback(prevRef.current);
    }
    prevRef.current = deps;
  });
}