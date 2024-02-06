var $dKOox$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $dKOox$react = require("react");
var $dKOox$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $dKOox$radixuireactcontext = require("@radix-ui/react-context");
var $dKOox$radixuiprimitive = require("@radix-ui/primitive");
var $dKOox$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $dKOox$radixuireactuseprevious = require("@radix-ui/react-use-previous");
var $dKOox$radixuireactusesize = require("@radix-ui/react-use-size");
var $dKOox$radixuireactpresence = require("@radix-ui/react-presence");
var $dKOox$radixuireactprimitive = require("@radix-ui/react-primitive");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createCheckboxScope", () => $a17f2c9fbf2ccf8c$export$b566c4ff5488ea01);
$parcel$export(module.exports, "Checkbox", () => $a17f2c9fbf2ccf8c$export$48513f6b9f8ce62d);
$parcel$export(module.exports, "CheckboxIndicator", () => $a17f2c9fbf2ccf8c$export$59aad738f51d1c05);
$parcel$export(module.exports, "Root", () => $a17f2c9fbf2ccf8c$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Indicator", () => $a17f2c9fbf2ccf8c$export$adb584737d712b70);










/* -------------------------------------------------------------------------------------------------
 * Checkbox
 * -----------------------------------------------------------------------------------------------*/ const $a17f2c9fbf2ccf8c$var$CHECKBOX_NAME = 'Checkbox';
const [$a17f2c9fbf2ccf8c$var$createCheckboxContext, $a17f2c9fbf2ccf8c$export$b566c4ff5488ea01] = $dKOox$radixuireactcontext.createContextScope($a17f2c9fbf2ccf8c$var$CHECKBOX_NAME);
const [$a17f2c9fbf2ccf8c$var$CheckboxProvider, $a17f2c9fbf2ccf8c$var$useCheckboxContext] = $a17f2c9fbf2ccf8c$var$createCheckboxContext($a17f2c9fbf2ccf8c$var$CHECKBOX_NAME);
const $a17f2c9fbf2ccf8c$export$48513f6b9f8ce62d = /*#__PURE__*/ $dKOox$react.forwardRef((props, forwardedRef)=>{
    const { __scopeCheckbox: __scopeCheckbox , name: name , checked: checkedProp , defaultChecked: defaultChecked , required: required , disabled: disabled , value: value = 'on' , onCheckedChange: onCheckedChange , ...checkboxProps } = props;
    const [button, setButton] = $dKOox$react.useState(null);
    const composedRefs = $dKOox$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setButton(node)
    );
    const hasConsumerStoppedPropagationRef = $dKOox$react.useRef(false); // We set this to true by default so that events bubble to forms without JS (SSR)
    const isFormControl = button ? Boolean(button.closest('form')) : true;
    const [checked = false, setChecked] = $dKOox$radixuireactusecontrollablestate.useControllableState({
        prop: checkedProp,
        defaultProp: defaultChecked,
        onChange: onCheckedChange
    });
    const initialCheckedStateRef = $dKOox$react.useRef(checked);
    $dKOox$react.useEffect(()=>{
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
    return /*#__PURE__*/ $dKOox$react.createElement($a17f2c9fbf2ccf8c$var$CheckboxProvider, {
        scope: __scopeCheckbox,
        state: checked,
        disabled: disabled
    }, /*#__PURE__*/ $dKOox$react.createElement($dKOox$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($dKOox$babelruntimehelpersextends))({
        type: "button",
        role: "checkbox",
        "aria-checked": $a17f2c9fbf2ccf8c$var$isIndeterminate(checked) ? 'mixed' : checked,
        "aria-required": required,
        "data-state": $a17f2c9fbf2ccf8c$var$getState(checked),
        "data-disabled": disabled ? '' : undefined,
        disabled: disabled,
        value: value
    }, checkboxProps, {
        ref: composedRefs,
        onKeyDown: $dKOox$radixuiprimitive.composeEventHandlers(props.onKeyDown, (event)=>{
            // According to WAI ARIA, Checkboxes don't activate on enter keypress
            if (event.key === 'Enter') event.preventDefault();
        }),
        onClick: $dKOox$radixuiprimitive.composeEventHandlers(props.onClick, (event)=>{
            setChecked((prevChecked)=>$a17f2c9fbf2ccf8c$var$isIndeterminate(prevChecked) ? true : !prevChecked
            );
            if (isFormControl) {
                hasConsumerStoppedPropagationRef.current = event.isPropagationStopped(); // if checkbox is in a form, stop propagation from the button so that we only propagate
                // one click event (from the input). We propagate changes from an input so that native
                // form validation works and form events reflect checkbox updates.
                if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
        })
    })), isFormControl && /*#__PURE__*/ $dKOox$react.createElement($a17f2c9fbf2ccf8c$var$BubbleInput, {
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
/*#__PURE__*/ Object.assign($a17f2c9fbf2ccf8c$export$48513f6b9f8ce62d, {
    displayName: $a17f2c9fbf2ccf8c$var$CHECKBOX_NAME
});
/* -------------------------------------------------------------------------------------------------
 * CheckboxIndicator
 * -----------------------------------------------------------------------------------------------*/ const $a17f2c9fbf2ccf8c$var$INDICATOR_NAME = 'CheckboxIndicator';
const $a17f2c9fbf2ccf8c$export$59aad738f51d1c05 = /*#__PURE__*/ $dKOox$react.forwardRef((props, forwardedRef)=>{
    const { __scopeCheckbox: __scopeCheckbox , forceMount: forceMount , ...indicatorProps } = props;
    const context = $a17f2c9fbf2ccf8c$var$useCheckboxContext($a17f2c9fbf2ccf8c$var$INDICATOR_NAME, __scopeCheckbox);
    return /*#__PURE__*/ $dKOox$react.createElement($dKOox$radixuireactpresence.Presence, {
        present: forceMount || $a17f2c9fbf2ccf8c$var$isIndeterminate(context.state) || context.state === true
    }, /*#__PURE__*/ $dKOox$react.createElement($dKOox$radixuireactprimitive.Primitive.span, ($parcel$interopDefault($dKOox$babelruntimehelpersextends))({
        "data-state": $a17f2c9fbf2ccf8c$var$getState(context.state),
        "data-disabled": context.disabled ? '' : undefined
    }, indicatorProps, {
        ref: forwardedRef,
        style: {
            pointerEvents: 'none',
            ...props.style
        }
    })));
});
/*#__PURE__*/ Object.assign($a17f2c9fbf2ccf8c$export$59aad738f51d1c05, {
    displayName: $a17f2c9fbf2ccf8c$var$INDICATOR_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $a17f2c9fbf2ccf8c$var$BubbleInput = (props)=>{
    const { control: control , checked: checked , bubbles: bubbles = true , ...inputProps } = props;
    const ref = $dKOox$react.useRef(null);
    const prevChecked = $dKOox$radixuireactuseprevious.usePrevious(checked);
    const controlSize = $dKOox$radixuireactusesize.useSize(control); // Bubble checked change to parents (e.g form change event)
    $dKOox$react.useEffect(()=>{
        const input = ref.current;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(inputProto, 'checked');
        const setChecked = descriptor.set;
        if (prevChecked !== checked && setChecked) {
            const event = new Event('click', {
                bubbles: bubbles
            });
            input.indeterminate = $a17f2c9fbf2ccf8c$var$isIndeterminate(checked);
            setChecked.call(input, $a17f2c9fbf2ccf8c$var$isIndeterminate(checked) ? false : checked);
            input.dispatchEvent(event);
        }
    }, [
        prevChecked,
        checked,
        bubbles
    ]);
    return /*#__PURE__*/ $dKOox$react.createElement("input", ($parcel$interopDefault($dKOox$babelruntimehelpersextends))({
        type: "checkbox",
        "aria-hidden": true,
        defaultChecked: $a17f2c9fbf2ccf8c$var$isIndeterminate(checked) ? false : checked
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
function $a17f2c9fbf2ccf8c$var$isIndeterminate(checked) {
    return checked === 'indeterminate';
}
function $a17f2c9fbf2ccf8c$var$getState(checked) {
    return $a17f2c9fbf2ccf8c$var$isIndeterminate(checked) ? 'indeterminate' : checked ? 'checked' : 'unchecked';
}
const $a17f2c9fbf2ccf8c$export$be92b6f5f03c0fe9 = $a17f2c9fbf2ccf8c$export$48513f6b9f8ce62d;
const $a17f2c9fbf2ccf8c$export$adb584737d712b70 = $a17f2c9fbf2ccf8c$export$59aad738f51d1c05;




//# sourceMappingURL=index.js.map
