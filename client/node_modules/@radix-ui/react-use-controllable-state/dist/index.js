var $ijazI$react = require("react");
var $ijazI$radixuireactusecallbackref = require("@radix-ui/react-use-callback-ref");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}

$parcel$export(module.exports, "useControllableState", () => $b84d42d44371bff7$export$6f32135080cb4c3);


function $b84d42d44371bff7$export$6f32135080cb4c3({ prop: prop , defaultProp: defaultProp , onChange: onChange = ()=>{}  }) {
    const [uncontrolledProp, setUncontrolledProp] = $b84d42d44371bff7$var$useUncontrolledState({
        defaultProp: defaultProp,
        onChange: onChange
    });
    const isControlled = prop !== undefined;
    const value1 = isControlled ? prop : uncontrolledProp;
    const handleChange = $ijazI$radixuireactusecallbackref.useCallbackRef(onChange);
    const setValue = $ijazI$react.useCallback((nextValue)=>{
        if (isControlled) {
            const setter = nextValue;
            const value = typeof nextValue === 'function' ? setter(prop) : nextValue;
            if (value !== prop) handleChange(value);
        } else setUncontrolledProp(nextValue);
    }, [
        isControlled,
        prop,
        setUncontrolledProp,
        handleChange
    ]);
    return [
        value1,
        setValue
    ];
}
function $b84d42d44371bff7$var$useUncontrolledState({ defaultProp: defaultProp , onChange: onChange  }) {
    const uncontrolledState = $ijazI$react.useState(defaultProp);
    const [value] = uncontrolledState;
    const prevValueRef = $ijazI$react.useRef(value);
    const handleChange = $ijazI$radixuireactusecallbackref.useCallbackRef(onChange);
    $ijazI$react.useEffect(()=>{
        if (prevValueRef.current !== value) {
            handleChange(value);
            prevValueRef.current = value;
        }
    }, [
        value,
        prevValueRef,
        handleChange
    ]);
    return uncontrolledState;
}




//# sourceMappingURL=index.js.map
