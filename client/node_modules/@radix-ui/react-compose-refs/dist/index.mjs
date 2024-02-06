import {useCallback as $3vqmr$useCallback} from "react";


/**
 * Set a given ref to a given value
 * This utility takes care of different types of refs: callback refs and RefObject(s)
 */ function $6ed0406888f73fc4$var$setRef(ref, value) {
    if (typeof ref === 'function') ref(value);
    else if (ref !== null && ref !== undefined) ref.current = value;
}
/**
 * A utility to compose multiple refs together
 * Accepts callback refs and RefObject(s)
 */ function $6ed0406888f73fc4$export$43e446d32b3d21af(...refs) {
    return (node)=>refs.forEach((ref)=>$6ed0406888f73fc4$var$setRef(ref, node)
        )
    ;
}
/**
 * A custom hook that composes multiple refs
 * Accepts callback refs and RefObject(s)
 */ function $6ed0406888f73fc4$export$c7b2cbe3552a0d05(...refs) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return $3vqmr$useCallback($6ed0406888f73fc4$export$43e446d32b3d21af(...refs), refs);
}




export {$6ed0406888f73fc4$export$43e446d32b3d21af as composeRefs, $6ed0406888f73fc4$export$c7b2cbe3552a0d05 as useComposedRefs};
//# sourceMappingURL=index.mjs.map
