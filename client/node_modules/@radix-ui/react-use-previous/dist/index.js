var $kjM8v$react = require("react");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}

$parcel$export(module.exports, "usePrevious", () => $11bc82d0001dc9a8$export$5cae361ad82dce8b);

function $11bc82d0001dc9a8$export$5cae361ad82dce8b(value) {
    const ref = $kjM8v$react.useRef({
        value: value,
        previous: value
    }); // We compare values before making an update to ensure that
    // a change has been made. This ensures the previous value is
    // persisted correctly between renders.
    return $kjM8v$react.useMemo(()=>{
        if (ref.current.value !== value) {
            ref.current.previous = ref.current.value;
            ref.current.value = value;
        }
        return ref.current.previous;
    }, [
        value
    ]);
}




//# sourceMappingURL=index.js.map
