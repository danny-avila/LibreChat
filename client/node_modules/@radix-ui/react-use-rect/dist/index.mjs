import {useState as $jNFHB$useState, useEffect as $jNFHB$useEffect} from "react";
import {observeElementRect as $jNFHB$observeElementRect} from "@radix-ui/rect";



/**
 * Use this custom hook to get access to an element's rect (getBoundingClientRect)
 * and observe it along time.
 */ function $ccac1052a272b78b$export$9823a655542017cd(measurable) {
    const [rect, setRect] = $jNFHB$useState();
    $jNFHB$useEffect(()=>{
        if (measurable) {
            const unobserve = $jNFHB$observeElementRect(measurable, setRect);
            return ()=>{
                setRect(undefined);
                unobserve();
            };
        }
        return;
    }, [
        measurable
    ]);
    return rect;
}




export {$ccac1052a272b78b$export$9823a655542017cd as useRect};
//# sourceMappingURL=index.mjs.map
