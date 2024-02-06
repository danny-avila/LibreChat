import {useRef as $lwiWj$useRef, useEffect as $lwiWj$useEffect, useMemo as $lwiWj$useMemo} from "react";


/**
 * A custom hook that converts a callback to a ref to avoid triggering re-renders when passed as a
 * prop or avoid re-executing effects when passed as a dependency
 */ function $b1b2314f5f9a1d84$export$25bec8c6f54ee79a(callback) {
    const callbackRef = $lwiWj$useRef(callback);
    $lwiWj$useEffect(()=>{
        callbackRef.current = callback;
    }); // https://github.com/facebook/react/issues/19240
    return $lwiWj$useMemo(()=>(...args)=>{
            var _callbackRef$current;
            return (_callbackRef$current = callbackRef.current) === null || _callbackRef$current === void 0 ? void 0 : _callbackRef$current.call(callbackRef, ...args);
        }
    , []);
}




export {$b1b2314f5f9a1d84$export$25bec8c6f54ee79a as useCallbackRef};
//# sourceMappingURL=index.mjs.map
