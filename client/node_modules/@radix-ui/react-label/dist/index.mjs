import $7V4JZ$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {forwardRef as $7V4JZ$forwardRef, createElement as $7V4JZ$createElement} from "react";
import {Primitive as $7V4JZ$Primitive} from "@radix-ui/react-primitive";




/* -------------------------------------------------------------------------------------------------
 * Label
 * -----------------------------------------------------------------------------------------------*/ const $b73a6c6685e72184$var$NAME = 'Label';
const $b73a6c6685e72184$export$b04be29aa201d4f5 = /*#__PURE__*/ $7V4JZ$forwardRef((props, forwardedRef)=>{
    return /*#__PURE__*/ $7V4JZ$createElement($7V4JZ$Primitive.label, $7V4JZ$babelruntimehelpersesmextends({}, props, {
        ref: forwardedRef,
        onMouseDown: (event)=>{
            var _props$onMouseDown;
            (_props$onMouseDown = props.onMouseDown) === null || _props$onMouseDown === void 0 || _props$onMouseDown.call(props, event); // prevent text selection when double clicking label
            if (!event.defaultPrevented && event.detail > 1) event.preventDefault();
        }
    }));
});
/*#__PURE__*/ Object.assign($b73a6c6685e72184$export$b04be29aa201d4f5, {
    displayName: $b73a6c6685e72184$var$NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $b73a6c6685e72184$export$be92b6f5f03c0fe9 = $b73a6c6685e72184$export$b04be29aa201d4f5;




export {$b73a6c6685e72184$export$b04be29aa201d4f5 as Label, $b73a6c6685e72184$export$be92b6f5f03c0fe9 as Root};
//# sourceMappingURL=index.mjs.map
