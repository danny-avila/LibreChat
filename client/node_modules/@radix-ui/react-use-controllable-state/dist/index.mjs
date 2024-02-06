import {useCallback as $bnPw9$useCallback, useState as $bnPw9$useState, useRef as $bnPw9$useRef, useEffect as $bnPw9$useEffect} from "react";
import {useCallbackRef as $bnPw9$useCallbackRef} from "@radix-ui/react-use-callback-ref";



function $71cd76cc60e0454e$export$6f32135080cb4c3({ prop: prop , defaultProp: defaultProp , onChange: onChange = ()=>{}  }) {
    const [uncontrolledProp, setUncontrolledProp] = $71cd76cc60e0454e$var$useUncontrolledState({
        defaultProp: defaultProp,
        onChange: onChange
    });
    const isControlled = prop !== undefined;
    const value1 = isControlled ? prop : uncontrolledProp;
    const handleChange = $bnPw9$useCallbackRef(onChange);
    const setValue = $bnPw9$useCallback((nextValue)=>{
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
function $71cd76cc60e0454e$var$useUncontrolledState({ defaultProp: defaultProp , onChange: onChange  }) {
    const uncontrolledState = $bnPw9$useState(defaultProp);
    const [value] = uncontrolledState;
    const prevValueRef = $bnPw9$useRef(value);
    const handleChange = $bnPw9$useCallbackRef(onChange);
    $bnPw9$useEffect(()=>{
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




export {$71cd76cc60e0454e$export$6f32135080cb4c3 as useControllableState};
//# sourceMappingURL=index.mjs.map
