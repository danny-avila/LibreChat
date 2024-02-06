var $KEKIw$react = require("react");
var $KEKIw$radixuirect = require("@radix-ui/rect");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}

$parcel$export(module.exports, "useRect", () => $c64cf18f363cc04f$export$9823a655542017cd);


/**
 * Use this custom hook to get access to an element's rect (getBoundingClientRect)
 * and observe it along time.
 */ function $c64cf18f363cc04f$export$9823a655542017cd(measurable) {
    const [rect, setRect] = $KEKIw$react.useState();
    $KEKIw$react.useEffect(()=>{
        if (measurable) {
            const unobserve = $KEKIw$radixuirect.observeElementRect(measurable, setRect);
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




//# sourceMappingURL=index.js.map
