var $dAvBt$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $dAvBt$react = require("react");
var $dAvBt$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "Slot", () => $82dc8d030dec7549$export$8c6ed5c666ac1360);
$parcel$export(module.exports, "Slottable", () => $82dc8d030dec7549$export$d9f1ccf0bdb05d45);
$parcel$export(module.exports, "Root", () => $82dc8d030dec7549$export$be92b6f5f03c0fe9);



/* -------------------------------------------------------------------------------------------------
 * Slot
 * -----------------------------------------------------------------------------------------------*/ const $82dc8d030dec7549$export$8c6ed5c666ac1360 = /*#__PURE__*/ $dAvBt$react.forwardRef((props, forwardedRef)=>{
    const { children: children , ...slotProps } = props;
    const childrenArray = $dAvBt$react.Children.toArray(children);
    const slottable = childrenArray.find($82dc8d030dec7549$var$isSlottable);
    if (slottable) {
        // the new element to render is the one passed as a child of `Slottable`
        const newElement = slottable.props.children;
        const newChildren = childrenArray.map((child)=>{
            if (child === slottable) {
                // because the new element will be the one rendered, we are only interested
                // in grabbing its children (`newElement.props.children`)
                if ($dAvBt$react.Children.count(newElement) > 1) return $dAvBt$react.Children.only(null);
                return /*#__PURE__*/ $dAvBt$react.isValidElement(newElement) ? newElement.props.children : null;
            } else return child;
        });
        return /*#__PURE__*/ $dAvBt$react.createElement($82dc8d030dec7549$var$SlotClone, ($parcel$interopDefault($dAvBt$babelruntimehelpersextends))({}, slotProps, {
            ref: forwardedRef
        }), /*#__PURE__*/ $dAvBt$react.isValidElement(newElement) ? /*#__PURE__*/ $dAvBt$react.cloneElement(newElement, undefined, newChildren) : null);
    }
    return /*#__PURE__*/ $dAvBt$react.createElement($82dc8d030dec7549$var$SlotClone, ($parcel$interopDefault($dAvBt$babelruntimehelpersextends))({}, slotProps, {
        ref: forwardedRef
    }), children);
});
$82dc8d030dec7549$export$8c6ed5c666ac1360.displayName = 'Slot';
/* -------------------------------------------------------------------------------------------------
 * SlotClone
 * -----------------------------------------------------------------------------------------------*/ const $82dc8d030dec7549$var$SlotClone = /*#__PURE__*/ $dAvBt$react.forwardRef((props, forwardedRef)=>{
    const { children: children , ...slotProps } = props;
    if (/*#__PURE__*/ $dAvBt$react.isValidElement(children)) return /*#__PURE__*/ $dAvBt$react.cloneElement(children, {
        ...$82dc8d030dec7549$var$mergeProps(slotProps, children.props),
        ref: forwardedRef ? $dAvBt$radixuireactcomposerefs.composeRefs(forwardedRef, children.ref) : children.ref
    });
    return $dAvBt$react.Children.count(children) > 1 ? $dAvBt$react.Children.only(null) : null;
});
$82dc8d030dec7549$var$SlotClone.displayName = 'SlotClone';
/* -------------------------------------------------------------------------------------------------
 * Slottable
 * -----------------------------------------------------------------------------------------------*/ const $82dc8d030dec7549$export$d9f1ccf0bdb05d45 = ({ children: children  })=>{
    return /*#__PURE__*/ $dAvBt$react.createElement($dAvBt$react.Fragment, null, children);
};
/* ---------------------------------------------------------------------------------------------- */ function $82dc8d030dec7549$var$isSlottable(child) {
    return /*#__PURE__*/ $dAvBt$react.isValidElement(child) && child.type === $82dc8d030dec7549$export$d9f1ccf0bdb05d45;
}
function $82dc8d030dec7549$var$mergeProps(slotProps, childProps) {
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
const $82dc8d030dec7549$export$be92b6f5f03c0fe9 = $82dc8d030dec7549$export$8c6ed5c666ac1360;




//# sourceMappingURL=index.js.map
