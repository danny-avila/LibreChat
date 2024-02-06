import $jbnEx$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {forwardRef as $jbnEx$forwardRef, createElement as $jbnEx$createElement} from "react";
import {Primitive as $jbnEx$Primitive} from "@radix-ui/react-primitive";




/* -------------------------------------------------------------------------------------------------
 * Arrow
 * -----------------------------------------------------------------------------------------------*/ const $7e8f5cd07187803e$var$NAME = 'Arrow';
const $7e8f5cd07187803e$export$21b07c8f274aebd5 = /*#__PURE__*/ $jbnEx$forwardRef((props, forwardedRef)=>{
    const { children: children , width: width = 10 , height: height = 5 , ...arrowProps } = props;
    return /*#__PURE__*/ $jbnEx$createElement($jbnEx$Primitive.svg, $jbnEx$babelruntimehelpersesmextends({}, arrowProps, {
        ref: forwardedRef,
        width: width,
        height: height,
        viewBox: "0 0 30 10",
        preserveAspectRatio: "none"
    }), props.asChild ? children : /*#__PURE__*/ $jbnEx$createElement("polygon", {
        points: "0,0 30,0 15,10"
    }));
});
/*#__PURE__*/ Object.assign($7e8f5cd07187803e$export$21b07c8f274aebd5, {
    displayName: $7e8f5cd07187803e$var$NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $7e8f5cd07187803e$export$be92b6f5f03c0fe9 = $7e8f5cd07187803e$export$21b07c8f274aebd5;




export {$7e8f5cd07187803e$export$21b07c8f274aebd5 as Arrow, $7e8f5cd07187803e$export$be92b6f5f03c0fe9 as Root};
//# sourceMappingURL=index.mjs.map
