import _slicedToArray from "@babel/runtime/helpers/esm/slicedToArray";
import { useState } from 'react';
import isMobile from "../isMobile";
import useLayoutEffect from "./useLayoutEffect";

/**
 * Hook to detect if the user is on a mobile device
 * Notice that this hook will only detect the device type in effect, so it will always be false in server side
 */
var useMobile = function useMobile() {
  var _useState = useState(false),
    _useState2 = _slicedToArray(_useState, 2),
    mobile = _useState2[0],
    setMobile = _useState2[1];
  useLayoutEffect(function () {
    setMobile(isMobile());
  }, []);
  return mobile;
};
export default useMobile;