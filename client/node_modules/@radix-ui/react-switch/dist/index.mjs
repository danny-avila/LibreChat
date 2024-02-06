import $irPIl$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {forwardRef as $irPIl$forwardRef, useState as $irPIl$useState, useRef as $irPIl$useRef, createElement as $irPIl$createElement, useEffect as $irPIl$useEffect} from "react";
import {composeEventHandlers as $irPIl$composeEventHandlers} from "@radix-ui/primitive";
import {useComposedRefs as $irPIl$useComposedRefs} from "@radix-ui/react-compose-refs";
import {createContextScope as $irPIl$createContextScope} from "@radix-ui/react-context";
import {useControllableState as $irPIl$useControllableState} from "@radix-ui/react-use-controllable-state";
import {usePrevious as $irPIl$usePrevious} from "@radix-ui/react-use-previous";
import {useSize as $irPIl$useSize} from "@radix-ui/react-use-size";
import {Primitive as $irPIl$Primitive} from "@radix-ui/react-primitive";










/* -------------------------------------------------------------------------------------------------
 * Switch
 * -----------------------------------------------------------------------------------------------*/ const $6be4966fd9bbc698$var$SWITCH_NAME = 'Switch';
const [$6be4966fd9bbc698$var$createSwitchContext, $6be4966fd9bbc698$export$cf7f5f17f69cbd43] = $irPIl$createContextScope($6be4966fd9bbc698$var$SWITCH_NAME);
const [$6be4966fd9bbc698$var$SwitchProvider, $6be4966fd9bbc698$var$useSwitchContext] = $6be4966fd9bbc698$var$createSwitchContext($6be4966fd9bbc698$var$SWITCH_NAME);
const $6be4966fd9bbc698$export$b5d5cf8927ab7262 = /*#__PURE__*/ $irPIl$forwardRef((props, forwardedRef)=>{
    const { __scopeSwitch: __scopeSwitch , name: name , checked: checkedProp , defaultChecked: defaultChecked , required: required , disabled: disabled , value: value = 'on' , onCheckedChange: onCheckedChange , ...switchProps } = props;
    const [button, setButton] = $irPIl$useState(null);
    const composedRefs = $irPIl$useComposedRefs(forwardedRef, (node)=>setButton(node)
    );
    const hasConsumerStoppedPropagationRef = $irPIl$useRef(false); // We set this to true by default so that events bubble to forms without JS (SSR)
    const isFormControl = button ? Boolean(button.closest('form')) : true;
    const [checked = false, setChecked] = $irPIl$useControllableState({
        prop: checkedProp,
        defaultProp: defaultChecked,
        onChange: onCheckedChange
    });
    return /*#__PURE__*/ $irPIl$createElement($6be4966fd9bbc698$var$SwitchProvider, {
        scope: __scopeSwitch,
        checked: checked,
        disabled: disabled
    }, /*#__PURE__*/ $irPIl$createElement($irPIl$Primitive.button, $irPIl$babelruntimehelpersesmextends({
        type: "button",
        role: "switch",
        "aria-checked": checked,
        "aria-required": required,
        "data-state": $6be4966fd9bbc698$var$getState(checked),
        "data-disabled": disabled ? '' : undefined,
        disabled: disabled,
        value: value
    }, switchProps, {
        ref: composedRefs,
        onClick: $irPIl$composeEventHandlers(props.onClick, (event)=>{
            setChecked((prevChecked)=>!prevChecked
            );
            if (isFormControl) {
                hasConsumerStoppedPropagationRef.current = event.isPropagationStopped(); // if switch is in a form, stop propagation from the button so that we only propagate
                // one click event (from the input). We propagate changes from an input so that native
                // form validation works and form events reflect switch updates.
                if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
        })
    })), isFormControl && /*#__PURE__*/ $irPIl$createElement($6be4966fd9bbc698$var$BubbleInput, {
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
/*#__PURE__*/ Object.assign($6be4966fd9bbc698$export$b5d5cf8927ab7262, {
    displayName: $6be4966fd9bbc698$var$SWITCH_NAME
});
/* -------------------------------------------------------------------------------------------------
 * SwitchThumb
 * -----------------------------------------------------------------------------------------------*/ const $6be4966fd9bbc698$var$THUMB_NAME = 'SwitchThumb';
const $6be4966fd9bbc698$export$4d07bf653ea69106 = /*#__PURE__*/ $irPIl$forwardRef((props, forwardedRef)=>{
    const { __scopeSwitch: __scopeSwitch , ...thumbProps } = props;
    const context = $6be4966fd9bbc698$var$useSwitchContext($6be4966fd9bbc698$var$THUMB_NAME, __scopeSwitch);
    return /*#__PURE__*/ $irPIl$createElement($irPIl$Primitive.span, $irPIl$babelruntimehelpersesmextends({
        "data-state": $6be4966fd9bbc698$var$getState(context.checked),
        "data-disabled": context.disabled ? '' : undefined
    }, thumbProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($6be4966fd9bbc698$export$4d07bf653ea69106, {
    displayName: $6be4966fd9bbc698$var$THUMB_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $6be4966fd9bbc698$var$BubbleInput = (props)=>{
    const { control: control , checked: checked , bubbles: bubbles = true , ...inputProps } = props;
    const ref = $irPIl$useRef(null);
    const prevChecked = $irPIl$usePrevious(checked);
    const controlSize = $irPIl$useSize(control); // Bubble checked change to parents (e.g form change event)
    $irPIl$useEffect(()=>{
        const input = ref.current;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(inputProto, 'checked');
        const setChecked = descriptor.set;
        if (prevChecked !== checked && setChecked) {
            const event = new Event('click', {
                bubbles: bubbles
            });
            setChecked.call(input, checked);
            input.dispatchEvent(event);
        }
    }, [
        prevChecked,
        checked,
        bubbles
    ]);
    return /*#__PURE__*/ $irPIl$createElement("input", $irPIl$babelruntimehelpersesmextends({
        type: "checkbox",
        "aria-hidden": true,
        defaultChecked: checked
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
function $6be4966fd9bbc698$var$getState(checked) {
    return checked ? 'checked' : 'unchecked';
}
const $6be4966fd9bbc698$export$be92b6f5f03c0fe9 = $6be4966fd9bbc698$export$b5d5cf8927ab7262;
const $6be4966fd9bbc698$export$6521433ed15a34db = $6be4966fd9bbc698$export$4d07bf653ea69106;




export {$6be4966fd9bbc698$export$cf7f5f17f69cbd43 as createSwitchScope, $6be4966fd9bbc698$export$b5d5cf8927ab7262 as Switch, $6be4966fd9bbc698$export$4d07bf653ea69106 as SwitchThumb, $6be4966fd9bbc698$export$be92b6f5f03c0fe9 as Root, $6be4966fd9bbc698$export$6521433ed15a34db as Thumb};
//# sourceMappingURL=index.mjs.map
