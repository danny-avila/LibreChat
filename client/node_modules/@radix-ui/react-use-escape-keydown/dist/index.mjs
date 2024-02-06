import {useEffect as $hPSQ5$useEffect} from "react";
import {useCallbackRef as $hPSQ5$useCallbackRef} from "@radix-ui/react-use-callback-ref";



/**
 * Listens for when the escape key is down
 */ function $addc16e1bbe58fd0$export$3a72a57244d6e765(onEscapeKeyDownProp, ownerDocument = globalThis === null || globalThis === void 0 ? void 0 : globalThis.document) {
    const onEscapeKeyDown = $hPSQ5$useCallbackRef(onEscapeKeyDownProp);
    $hPSQ5$useEffect(()=>{
        const handleKeyDown = (event)=>{
            if (event.key === 'Escape') onEscapeKeyDown(event);
        };
        ownerDocument.addEventListener('keydown', handleKeyDown);
        return ()=>ownerDocument.removeEventListener('keydown', handleKeyDown)
        ;
    }, [
        onEscapeKeyDown,
        ownerDocument
    ]);
}




export {$addc16e1bbe58fd0$export$3a72a57244d6e765 as useEscapeKeydown};
//# sourceMappingURL=index.mjs.map
