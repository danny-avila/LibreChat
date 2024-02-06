import { useRef, useEffect } from 'react';
import raf from "rc-util/es/raf";

/**
 * Always trigger latest once when call multiple time
 */
export default (function () {
  var idRef = useRef(0);
  var cleanUp = function cleanUp() {
    raf.cancel(idRef.current);
  };
  useEffect(function () {
    return cleanUp;
  }, []);
  return function (callback) {
    cleanUp();
    idRef.current = raf(function () {
      callback();
    });
  };
});