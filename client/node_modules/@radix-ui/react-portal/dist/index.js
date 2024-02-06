var $amzHf$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $amzHf$react = require("react");
var $amzHf$reactdom = require("react-dom");
var $amzHf$radixuireactprimitive = require("@radix-ui/react-primitive");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "Portal", () => $913a70b877676c16$export$602eac185826482c);
$parcel$export(module.exports, "Root", () => $913a70b877676c16$export$be92b6f5f03c0fe9);




/* -------------------------------------------------------------------------------------------------
 * Portal
 * -----------------------------------------------------------------------------------------------*/ const $913a70b877676c16$var$PORTAL_NAME = 'Portal';
const $913a70b877676c16$export$602eac185826482c = /*#__PURE__*/ $amzHf$react.forwardRef((props, forwardedRef)=>{
    var _globalThis$document;
    const { container: container = globalThis === null || globalThis === void 0 ? void 0 : (_globalThis$document = globalThis.document) === null || _globalThis$document === void 0 ? void 0 : _globalThis$document.body , ...portalProps } = props;
    return container ? /*#__PURE__*/ ($parcel$interopDefault($amzHf$reactdom)).createPortal(/*#__PURE__*/ $amzHf$react.createElement($amzHf$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($amzHf$babelruntimehelpersextends))({}, portalProps, {
        ref: forwardedRef
    })), container) : null;
});
/*#__PURE__*/ Object.assign($913a70b877676c16$export$602eac185826482c, {
    displayName: $913a70b877676c16$var$PORTAL_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $913a70b877676c16$export$be92b6f5f03c0fe9 = $913a70b877676c16$export$602eac185826482c;




//# sourceMappingURL=index.js.map
