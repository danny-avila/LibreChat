import $9IrjX$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {forwardRef as $9IrjX$forwardRef, Children as $9IrjX$Children, isValidElement as $9IrjX$isValidElement, createElement as $9IrjX$createElement, cloneElement as $9IrjX$cloneElement, Fragment as $9IrjX$Fragment} from "react";
import {composeRefs as $9IrjX$composeRefs} from "@radix-ui/react-compose-refs";




/* -------------------------------------------------------------------------------------------------
 * Slot
 * -----------------------------------------------------------------------------------------------*/ const $5e63c961fc1ce211$export$8c6ed5c666ac1360 = /*#__PURE__*/ $9IrjX$forwardRef((props, forwardedRef)=>{
    const { children: children , ...slotProps } = props;
    const childrenArray = $9IrjX$Children.toArray(children);
    const slottable = childrenArray.find($5e63c961fc1ce211$var$isSlottable);
    if (slottable) {
        // the new element to render is the one passed as a child of `Slottable`
        const newElement = slottable.props.children;
        const newChildren = childrenArray.map((child)=>{
            if (child === slottable) {
                // because the new element will be the one rendered, we are only interested
                // in grabbing its children (`newElement.props.children`)
                if ($9IrjX$Children.count(newElement) > 1) return $9IrjX$Children.only(null);
                return /*#__PURE__*/ $9IrjX$isValidElement(newElement) ? newElement.props.children : null;
            } else return child;
        });
        return /*#__PURE__*/ $9IrjX$createElement($5e63c961fc1ce211$var$SlotClone, $9IrjX$babelruntimehelpersesmextends({}, slotProps, {
            ref: forwardedRef
        }), /*#__PURE__*/ $9IrjX$isValidElement(newElement) ? /*#__PURE__*/ $9IrjX$cloneElement(newElement, undefined, newChildren) : null);
    }
    return /*#__PURE__*/ $9IrjX$createElement($5e63c961fc1ce211$var$SlotClone, $9IrjX$babelruntimehelpersesmextends({}, slotProps, {
        ref: forwardedRef
    }), children);
});
$5e63c961fc1ce211$export$8c6ed5c666ac1360.displayName = 'Slot';
/* -------------------------------------------------------------------------------------------------
 * SlotClone
 * -----------------------------------------------------------------------------------------------*/ const $5e63c961fc1ce211$var$SlotClone = /*#__PURE__*/ $9IrjX$forwardRef((props, forwardedRef)=>{
    const { children: children , ...slotProps } = props;
    if (/*#__PURE__*/ $9IrjX$isValidElement(children)) return /*#__PURE__*/ $9IrjX$cloneElement(children, {
        ...$5e63c961fc1ce211$var$mergeProps(slotProps, children.props),
        ref: forwardedRef ? $9IrjX$composeRefs(forwardedRef, children.ref) : children.ref
    });
    return $9IrjX$Children.count(children) > 1 ? $9IrjX$Children.only(null) : null;
});
$5e63c961fc1ce211$var$SlotClone.displayName = 'SlotClone';
/* -------------------------------------------------------------------------------------------------
 * Slottable
 * -----------------------------------------------------------------------------------------------*/ const $5e63c961fc1ce211$export$d9f1ccf0bdb05d45 = ({ children: children  })=>{
    return /*#__PURE__*/ $9IrjX$createElement($9IrjX$Fragment, null, children);
};
/* ---------------------------------------------------------------------------------------------- */ function $5e63c961fc1ce211$var$isSlottable(child) {
    return /*#__PURE__*/ $9IrjX$isValidElement(child) && child.type === $5e63c961fc1ce211$export$d9f1ccf0bdb05d45;
}
function $5e63c961fc1ce211$var$mergeProps(slotProps, childProps) {
    // all child props should override
    const overrideProps = {
        ...childProps
    };
    for(const propName in childProps){
        const slotPropValue = slotProps[propName];
        const childPropValue = childProps[propName];
        const isHandler = /^on[A-Z]/.test(propName);
        if (isHandler) {
            // if the handler exists on both, we compose them
            if (slotPropValue && childPropValue) overrideProps[propName] = (...args)=>{
                childPropValue(...args);
                slotPropValue(...args);
            };
            else if (slotPropValue) overrideProps[propName] = slotPropValue;
        } else if (propName === 'style') overrideProps[propName] = {
            ...slotPropValue,
            ...childPropValue
        };
        else if (propName === 'className') overrideProps[propName] = [
            slotPropValue,
            childPropValue
        ].filter(Boolean).join(' ');
    }
    return {
        ...slotProps,
        ...overrideProps
    };
}
const $5e63c961fc1ce211$export$be92b6f5f03c0fe9 = $5e63c961fc1ce211$export$8c6ed5c666ac1360;




export {$5e63c961fc1ce211$export$8c6ed5c666ac1360 as Slot, $5e63c961fc1ce211$export$d9f1ccf0bdb05d45 as Slottable, $5e63c961fc1ce211$export$be92b6f5f03c0fe9 as Root};
//# sourceMappingURL=index.mjs.map
