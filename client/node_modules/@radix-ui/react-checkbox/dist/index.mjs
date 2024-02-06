import $1bpvS$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {forwardRef as $1bpvS$forwardRef, useState as $1bpvS$useState, useRef as $1bpvS$useRef, useEffect as $1bpvS$useEffect, createElement as $1bpvS$createElement} from "react";
import {useComposedRefs as $1bpvS$useComposedRefs} from "@radix-ui/react-compose-refs";
import {createContextScope as $1bpvS$createContextScope} from "@radix-ui/react-context";
import {composeEventHandlers as $1bpvS$composeEventHandlers} from "@radix-ui/primitive";
import {useControllableState as $1bpvS$useControllableState} from "@radix-ui/react-use-controllable-state";
import {usePrevious as $1bpvS$usePrevious} from "@radix-ui/react-use-previous";
import {useSize as $1bpvS$useSize} from "@radix-ui/react-use-size";
import {Presence as $1bpvS$Presence} from "@radix-ui/react-presence";
import {Primitive as $1bpvS$Primitive} from "@radix-ui/react-primitive";











/* -------------------------------------------------------------------------------------------------
 * Checkbox
 * -----------------------------------------------------------------------------------------------*/ const $e698a72e93240346$var$CHECKBOX_NAME = 'Checkbox';
const [$e698a72e93240346$var$createCheckboxContext, $e698a72e93240346$export$b566c4ff5488ea01] = $1bpvS$createContextScope($e698a72e93240346$var$CHECKBOX_NAME);
const [$e698a72e93240346$var$CheckboxProvider, $e698a72e93240346$var$useCheckboxContext] = $e698a72e93240346$var$createCheckboxContext($e698a72e93240346$var$CHECKBOX_NAME);
const $e698a72e93240346$export$48513f6b9f8ce62d = /*#__PURE__*/ $1bpvS$forwardRef((props, forwardedRef)=>{
    const { __scopeCheckbox: __scopeCheckbox , name: name , checked: checkedProp , defaultChecked: defaultChecked , required: required , disabled: disabled , value: value = 'on' , onCheckedChange: onCheckedChange , ...checkboxProps } = props;
    const [button, setButton] = $1bpvS$useState(null);
    const composedRefs = $1bpvS$useComposedRefs(forwardedRef, (node)=>setButton(node)
    );
    const hasConsumerStoppedPropagationRef = $1bpvS$useRef(false); // We set this to true by default so that events bubble to forms without JS (SSR)
    const isFormControl = button ? Boolean(button.closest('form')) : true;
    const [checked = false, setChecked] = $1bpvS$useControllableState({
        prop: checkedProp,
        defaultProp: defaultChecked,
        onChange: onCheckedChange
    });
    const initialCheckedStateRef = $1bpvS$useRef(checked);
    $1bpvS$useEffect(()=>{
        const form = button === null || button === void 0 ? void 0 : button.form;
        if (form) {
            const reset = ()=>setChecked(initialCheckedStateRef.current)
            ;
            form.addEventListener('reset', reset);
            return ()=>form.removeEventListener('reset', reset)
            ;
        }
    }, [
        button,
        setChecked
    ]);
    return /*#__PURE__*/ $1bpvS$createElement($e698a72e93240346$var$CheckboxProvider, {
        scope: __scopeCheckbox,
        state: checked,
        disabled: disabled
    }, /*#__PURE__*/ $1bpvS$createElement($1bpvS$Primitive.button, $1bpvS$babelruntimehelpersesmextends({
        type: "button",
        role: "checkbox",
        "aria-checked": $e698a72e93240346$var$isIndeterminate(checked) ? 'mixed' : checked,
        "aria-required": required,
        "data-state": $e698a72e93240346$var$getState(checked),
        "data-disabled": disabled ? '' : undefined,
        disabled: disabled,
        value: value
    }, checkboxProps, {
        ref: composedRefs,
        onKeyDown: $1bpvS$composeEventHandlers(props.onKeyDown, (event)=>{
            // According to WAI ARIA, Checkboxes don't activate on enter keypress
            if (event.key === 'Enter') event.preventDefault();
        }),
        onClick: $1bpvS$composeEventHandlers(props.onClick, (event)=>{
            setChecked((prevChecked)=>$e698a72e93240346$var$isIndeterminate(prevChecked) ? true : !prevChecked
            );
            if (isFormControl) {
                hasConsumerStoppedPropagationRef.current = event.isPropagationStopped(); // if checkbox is in a form, stop propagation from the button so that we only propagate
                // one click event (from the input). We propagate changes from an input so that native
                // form validation works and form events reflect checkbox updates.
                if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
        })
    })), isFormControl && /*#__PURE__*/ $1bpvS$createElement($e698a72e93240346$var$BubbleInput, {
        control: button,
        bubbles: !hasConsumerStoppedPropagationRef.current,
        name: name,
        value: value,
        checked: checked,
        required: required,
        disabled: disabled // We transform because the input is absolutely positioned but we have
        ,
        style: {
            transform: 'translateX(-100%)'
        }
    }));
});
/*#__PURE__*/ Object.assign($e698a72e93240346$export$48513f6b9f8ce62d, {
    displayName: $e698a72e93240346$var$CHECKBOX_NAME
});
/* -------------------------------------------------------------------------------------------------
 * CheckboxIndicator
 * -----------------------------------------------------------------------------------------------*/ const $e698a72e93240346$var$INDICATOR_NAME = 'CheckboxIndicator';
const $e698a72e93240346$export$59aad738f51d1c05 = /*#__PURE__*/ $1bpvS$forwardRef((props, forwardedRef)=>{
    const { __scopeCheckbox: __scopeCheckbox , forceMount: forceMount , ...indicatorProps } = props;
    const context = $e698a72e93240346$var$useCheckboxContext($e698a72e93240346$var$INDICATOR_NAME, __scopeCheckbox);
    return /*#__PURE__*/ $1bpvS$createElement($1bpvS$Presence, {
        present: forceMount || $e698a72e93240346$var$isIndeterminate(context.state) || context.state === true
    }, /*#__PURE__*/ $1bpvS$createElement($1bpvS$Primitive.span, $1bpvS$babelruntimehelpersesmextends({
        "data-state": $e698a72e93240346$var$getState(context.state),
        "data-disabled": context.disabled ? '' : undefined
    }, indicatorProps, {
        ref: forwardedRef,
        style: {
            pointerEvents: 'none',
            ...props.style
        }
    })));
});
/*#__PURE__*/ Object.assign($e698a72e93240346$export$59aad738f51d1c05, {
    displayName: $e698a72e93240346$var$INDICATOR_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $e698a72e93240346$var$BubbleInput = (props)=>{
    const { control: control , checked: checked , bubbles: bubbles = true , ...inputProps } = props;
    const ref = $1bpvS$useRef(null);
    const prevChecked = $1bpvS$usePrevious(checked);
    const controlSize = $1bpvS$useSize(control); // Bubble checked change to parents (e.g form change event)
    $1bpvS$useEffect(()=>{
        const input = ref.current;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(inputProto, 'checked');
        const setChecked = descriptor.set;
        if (prevChecked !== checked && setChecked) {
            const event = new Event('click', {
                bubbles: bubbles
            });
            input.indeterminate = $e698a72e93240346$var$isIndeterminate(checked);
            setChecked.call(input, $e698a72e93240346$var$isIndeterminate(checked) ? false : checked);
            input.dispatchEvent(event);
        }
    }, [
        prevChecked,
        checked,
        bubbles
    ]);
    return /*#__PURE__*/ $1bpvS$createElement("input", $1bpvS$babelruntimehelpersesmextends({
        type: "checkbox",
        "aria-hidden": true,
        defaultChecked: $e698a72e93240346$var$isIndeterminate(checked) ? false : checked
    }, inputProps, {
        tabIndex: -1,
        ref: ref,
        style: {
            ...props.style,
            ...controlSize,
            position: 'absolute',
            pointerEvents: 'none',
            opacity: 0,
            margin: 0
        }
    }));
};
function $e698a72e93240346$var$isIndeterminate(checked) {
    return checked === 'indeterminate';
}
function $e698a72e93240346$var$getState(checked) {
    return $e698a72e93240346$var$isIndeterminate(checked) ? 'indeterminate' : checked ? 'checked' : 'unchecked';
}
const $e698a72e93240346$export$be92b6f5f03c0fe9 = $e698a72e93240346$export$48513f6b9f8ce62d;
const $e698a72e93240346$export$adb584737d712b70 = $e698a72e93240346$export$59aad738f51d1c05;




export {$e698a72e93240346$export$b566c4ff5488ea01 as createCheckboxScope, $e698a72e93240346$export$48513f6b9f8ce62d as Checkbox, $e698a72e93240346$export$59aad738f51d1c05 as CheckboxIndicator, $e698a72e93240346$export$be92b6f5f03c0fe9 as Root, $e698a72e93240346$export$adb584737d712b70 as Indicator};
//# sourceMappingURL=index.mjs.map
