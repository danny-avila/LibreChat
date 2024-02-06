var $3sOcx$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $3sOcx$react = require("react");
var $3sOcx$radixuireactprimitive = require("@radix-ui/react-primitive");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "Separator", () => $1d2e81bd6a105992$export$1ff3c3f08ae963c0);
$parcel$export(module.exports, "Root", () => $1d2e81bd6a105992$export$be92b6f5f03c0fe9);



/* -------------------------------------------------------------------------------------------------
 *  Separator
 * -----------------------------------------------------------------------------------------------*/ const $1d2e81bd6a105992$var$NAME = 'Separator';
const $1d2e81bd6a105992$var$DEFAULT_ORIENTATION = 'horizontal';
const $1d2e81bd6a105992$var$ORIENTATIONS = [
    'horizontal',
    'vertical'
];
const $1d2e81bd6a105992$export$1ff3c3f08ae963c0 = /*#__PURE__*/ $3sOcx$react.forwardRef((props, forwardedRef)=>{
    const { decorative: decorative , orientation: orientationProp = $1d2e81bd6a105992$var$DEFAULT_ORIENTATION , ...domProps } = props;
    const orientation = $1d2e81bd6a105992$var$isValidOrientation(orientationProp) ? orientationProp : $1d2e81bd6a105992$var$DEFAULT_ORIENTATION; // `aria-orientation` defaults to `horizontal` so we only need it if `orientation` is vertical
    const ariaOrientation = orientation === 'vertical' ? orientation : undefined;
    const semanticProps = decorative ? {
        role: 'none'
    } : {
        'aria-orientation': ariaOrientation,
        role: 'separator'
    };
    return /*#__PURE__*/ $3sOcx$react.createElement($3sOcx$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($3sOcx$babelruntimehelpersextends))({
        "data-orientation": orientation
    }, semanticProps, domProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($1d2e81bd6a105992$export$1ff3c3f08ae963c0, {
    displayName: $1d2e81bd6a105992$var$NAME
});
$1d2e81bd6a105992$export$1ff3c3f08ae963c0.propTypes = {
    orientation (props, propName, componentName) {
        const propValue = props[propName];
        const strVal = String(propValue);
        if (propValue && !$1d2e81bd6a105992$var$isValidOrientation(propValue)) return new Error($1d2e81bd6a105992$var$getInvalidOrientationError(strVal, componentName));
        return null;
    }
};
/* -----------------------------------------------------------------------------------------------*/ // Split this out for clearer readability of the error message.
function $1d2e81bd6a105992$var$getInvalidOrientationError(value, componentName) {
    return `Invalid prop \`orientation\` of value \`${value}\` supplied to \`${componentName}\`, expected one of:
  - horizontal
  - vertical

Defaulting to \`${$1d2e81bd6a105992$var$DEFAULT_ORIENTATION}\`.`;
}
function $1d2e81bd6a105992$var$isValidOrientation(orientation) {
    return $1d2e81bd6a105992$var$ORIENTATIONS.includes(orientation);
}
const $1d2e81bd6a105992$export$be92b6f5f03c0fe9 = $1d2e81bd6a105992$export$1ff3c3f08ae963c0;




//# sourceMappingURL=index.js.map
