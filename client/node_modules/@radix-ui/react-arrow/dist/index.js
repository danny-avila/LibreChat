var $eQpDd$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $eQpDd$react = require("react");
var $eQpDd$radixuireactprimitive = require("@radix-ui/react-primitive");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "Arrow", () => $09f4ad68a9251bc3$export$21b07c8f274aebd5);
$parcel$export(module.exports, "Root", () => $09f4ad68a9251bc3$export$be92b6f5f03c0fe9);



/* -------------------------------------------------------------------------------------------------
 * Arrow
 * -----------------------------------------------------------------------------------------------*/ const $09f4ad68a9251bc3$var$NAME = 'Arrow';
const $09f4ad68a9251bc3$export$21b07c8f274aebd5 = /*#__PURE__*/ $eQpDd$react.forwardRef((props, forwardedRef)=>{
    const { children: children , width: width = 10 , height: height = 5 , ...arrowProps } = props;
    return /*#__PURE__*/ $eQpDd$react.createElement($eQpDd$radixuireactprimitive.Primitive.svg, ($parcel$interopDefault($eQpDd$babelruntimehelpersextends))({}, arrowProps, {
        ref: forwardedRef,
        width: width,
        height: height,
        viewBox: "0 0 30 10",
        preserveAspectRatio: "none"
    }), props.asChild ? children : /*#__PURE__*/ $eQpDd$react.createElement("polygon", {
        points: "0,0 30,0 15,10"
    }));
});
/*#__PURE__*/ Object.assign($09f4ad68a9251bc3$export$21b07c8f274aebd5, {
    displayName: $09f4ad68a9251bc3$var$NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $09f4ad68a9251bc3$export$be92b6f5f03c0fe9 = $09f4ad68a9251bc3$export$21b07c8f274aebd5;




//# sourceMappingURL=index.js.map
