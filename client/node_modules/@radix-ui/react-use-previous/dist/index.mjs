import {useRef as $8LvvK$useRef, useMemo as $8LvvK$useMemo} from "react";


function $010c2913dbd2fe3d$export$5cae361ad82dce8b(value) {
    const ref = $8LvvK$useRef({
        value: value,
        previous: value
    }); // We compare values before making an update to ensure that
    // a change has been made. This ensures the previous value is
    // persisted correctly between renders.
    return $8LvvK$useMemo(()=>{
        if (ref.current.value !== value) {
            ref.current.previous = ref.current.value;
            ref.current.value = value;
        }
        return ref.current.previous;
    }, [
        value
    ]);
}




export {$010c2913dbd2fe3d$export$5cae361ad82dce8b as usePrevious};
//# sourceMappingURL=index.mjs.map
