var $cWV9h$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $cWV9h$react = require("react");
var $cWV9h$radixuiprimitive = require("@radix-ui/primitive");
var $cWV9h$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $cWV9h$radixuireactcontext = require("@radix-ui/react-context");
var $cWV9h$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $cWV9h$radixuireactuseprevious = require("@radix-ui/react-use-previous");
var $cWV9h$radixuireactusesize = require("@radix-ui/react-use-size");
var $cWV9h$radixuireactprimitive = require("@radix-ui/react-primitive");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createSwitchScope", () => $4465bdeb0ef4ccd7$export$cf7f5f17f69cbd43);
$parcel$export(module.exports, "Switch", () => $4465bdeb0ef4ccd7$export$b5d5cf8927ab7262);
$parcel$export(module.exports, "SwitchThumb", () => $4465bdeb0ef4ccd7$export$4d07bf653ea69106);
$parcel$export(module.exports, "Root", () => $4465bdeb0ef4ccd7$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Thumb", () => $4465bdeb0ef4ccd7$export$6521433ed15a34db);









/* -------------------------------------------------------------------------------------------------
 * Switch
 * -----------------------------------------------------------------------------------------------*/ const $4465bdeb0ef4ccd7$var$SWITCH_NAME = 'Switch';
const [$4465bdeb0ef4ccd7$var$createSwitchContext, $4465bdeb0ef4ccd7$export$cf7f5f17f69cbd43] = $cWV9h$radixuireactcontext.createContextScope($4465bdeb0ef4ccd7$var$SWITCH_NAME);
const [$4465bdeb0ef4ccd7$var$SwitchProvider, $4465bdeb0ef4ccd7$var$useSwitchContext] = $4465bdeb0ef4ccd7$var$createSwitchContext($4465bdeb0ef4ccd7$var$SWITCH_NAME);
const $4465bdeb0ef4ccd7$export$b5d5cf8927ab7262 = /*#__PURE__*/ $cWV9h$react.forwardRef((props, forwardedRef)=>{
    const { __scopeSwitch: __scopeSwitch , name: name , checked: checkedProp , defaultChecked: defaultChecked , required: required , disabled: disabled , value: value = 'on' , onCheckedChange: onCheckedChange , ...switchProps } = props;
    const [button, setButton] = $cWV9h$react.useState(null);
    const composedRefs = $cWV9h$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setButton(node)
    );
    const hasConsumerStoppedPropagationRef = $cWV9h$react.useRef(false); // We set this to true by default so that events bubble to forms without JS (SSR)
    const isFormControl = button ? Boolean(button.closest('form')) : true;
    const [checked = false, setChecked] = $cWV9h$radixuireactusecontrollablestate.useControllableState({
        prop: checkedProp,
        defaultProp: defaultChecked,
        onChange: onCheckedChange
    });
    return /*#__PURE__*/ $cWV9h$react.createElement($4465bdeb0ef4ccd7$var$SwitchProvider, {
        scope: __scopeSwitch,
        checked: checked,
        disabled: disabled
    }, /*#__PURE__*/ $cWV9h$react.createElement($cWV9h$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($cWV9h$babelruntimehelpersextends))({
        type: "button",
        role: "switch",
        "aria-checked": checked,
        "aria-required": required,
        "data-state": $4465bdeb0ef4ccd7$var$getState(checked),
        "data-disabled": disabled ? '' : undefined,
        disabled: disabled,
        value: value
    }, switchProps, {
        ref: composedRefs,
        onClick: $cWV9h$radixuiprimitive.composeEventHandlers(props.onClick, (event)=>{
            setChecked((prevChecked)=>!prevChecked
            );
            if (isFormControl) {
                hasConsumerStoppedPropagationRef.current = event.isPropagationStopped(); // if switch is in a form, stop propagation from the button so that we only propagate
                // one click event (from the input). We propagate changes from an input so that native
                // form validation works and form events reflect switch updates.
                if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
        })
    })), isFormControl && /*#__PURE__*/ $cWV9h$react.createElement($4465bdeb0ef4ccd7$var$BubbleInput, {
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
/*#__PURE__*/ Object.assign($4465bdeb0ef4ccd7$export$b5d5cf8927ab7262, {
    displayName: $4465bdeb0ef4ccd7$var$SWITCH_NAME
});
/* -------------------------------------------------------------------------------------------------
 * SwitchThumb
 * -----------------------------------------------------------------------------------------------*/ const $4465bdeb0ef4ccd7$var$THUMB_NAME = 'SwitchThumb';
const $4465bdeb0ef4ccd7$export$4d07bf653ea69106 = /*#__PURE__*/ $cWV9h$react.forwardRef((props, forwardedRef)=>{
    const { __scopeSwitch: __scopeSwitch , ...thumbProps } = props;
    const context = $4465bdeb0ef4ccd7$var$useSwitchContext($4465bdeb0ef4ccd7$var$THUMB_NAME, __scopeSwitch);
    return /*#__PURE__*/ $cWV9h$react.createElement($cWV9h$radixuireactprimitive.Primitive.span, ($parcel$interopDefault($cWV9h$babelruntimehelpersextends))({
        "data-state": $4465bdeb0ef4ccd7$var$getState(context.checked),
        "data-disabled": context.disabled ? '' : undefined
    }, thumbProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($4465bdeb0ef4ccd7$export$4d07bf653ea69106, {
    displayName: $4465bdeb0ef4ccd7$var$THUMB_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $4465bdeb0ef4ccd7$var$BubbleInput = (props)=>{
    const { control: control , checked: checked , bubbles: bubbles = true , ...inputProps } = props;
    const ref = $cWV9h$react.useRef(null);
    const prevChecked = $cWV9h$radixuireactuseprevious.usePrevious(checked);
    const controlSize = $cWV9h$radixuireactusesize.useSize(control); // Bubble checked change to parents (e.g form change event)
    $cWV9h$react.useEffect(()=>{
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
    return /*#__PURE__*/ $cWV9h$react.createElement("input", ($parcel$interopDefault($cWV9h$babelruntimehelpersextends))({
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
function $4465bdeb0ef4ccd7$var$getState(checked) {
    return checked ? 'checked' : 'unchecked';
}
const $4465bdeb0ef4ccd7$export$be92b6f5f03c0fe9 = $4465bdeb0ef4ccd7$export$b5d5cf8927ab7262;
const $4465bdeb0ef4ccd7$export$6521433ed15a34db = $4465bdeb0ef4ccd7$export$4d07bf653ea69106;




//# sourceMappingURL=index.js.map
