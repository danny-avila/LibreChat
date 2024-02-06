import $7SXl2$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {forwardRef as $7SXl2$forwardRef, createElement as $7SXl2$createElement} from "react";
import $7SXl2$reactdom from "react-dom";
import {Primitive as $7SXl2$Primitive} from "@radix-ui/react-primitive";





/* -------------------------------------------------------------------------------------------------
 * Portal
 * -----------------------------------------------------------------------------------------------*/ const $f1701beae083dbae$var$PORTAL_NAME = 'Portal';
const $f1701beae083dbae$export$602eac185826482c = /*#__PURE__*/ $7SXl2$forwardRef((props, forwardedRef)=>{
    var _globalThis$document;
    const { container: container = globalThis === null || globalThis === void 0 ? void 0 : (_globalThis$document = globalThis.document) === null || _globalThis$document === void 0 ? void 0 : _globalThis$document.body , ...portalProps } = props;
    return container ? /*#__PURE__*/ $7SXl2$reactdom.createPortal(/*#__PURE__*/ $7SXl2$createElement($7SXl2$Primitive.div, $7SXl2$babelruntimehelpersesmextends({}, portalProps, {
        ref: forwardedRef
    })), container) : null;
});
/*#__PURE__*/ Object.assign($f1701beae083dbae$export$602eac185826482c, {
    displayName: $f1701beae083dbae$var$PORTAL_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $f1701beae083dbae$export$be92b6f5f03c0fe9 = $f1701beae083dbae$export$602eac185826482c;




export {$f1701beae083dbae$export$602eac185826482c as Portal, $f1701beae083dbae$export$be92b6f5f03c0fe9 as Root};
//# sourceMappingURL=index.mjs.map
