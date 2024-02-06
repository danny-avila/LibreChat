var $g2vWm$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $g2vWm$react = require("react");
var $g2vWm$radixuiprimitive = require("@radix-ui/primitive");
var $g2vWm$radixuireactprimitive = require("@radix-ui/react-primitive");
var $g2vWm$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $g2vWm$radixuireactusecallbackref = require("@radix-ui/react-use-callback-ref");
var $g2vWm$radixuireactuseescapekeydown = require("@radix-ui/react-use-escape-keydown");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "DismissableLayer", () => $d715e0554b679f1f$export$177fb62ff3ec1f22);
$parcel$export(module.exports, "DismissableLayerBranch", () => $d715e0554b679f1f$export$4d5eb2109db14228);
$parcel$export(module.exports, "Root", () => $d715e0554b679f1f$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Branch", () => $d715e0554b679f1f$export$aecb2ddcb55c95be);







/* -------------------------------------------------------------------------------------------------
 * DismissableLayer
 * -----------------------------------------------------------------------------------------------*/ const $d715e0554b679f1f$var$DISMISSABLE_LAYER_NAME = 'DismissableLayer';
const $d715e0554b679f1f$var$CONTEXT_UPDATE = 'dismissableLayer.update';
const $d715e0554b679f1f$var$POINTER_DOWN_OUTSIDE = 'dismissableLayer.pointerDownOutside';
const $d715e0554b679f1f$var$FOCUS_OUTSIDE = 'dismissableLayer.focusOutside';
let $d715e0554b679f1f$var$originalBodyPointerEvents;
const $d715e0554b679f1f$var$DismissableLayerContext = /*#__PURE__*/ $g2vWm$react.createContext({
    layers: new Set(),
    layersWithOutsidePointerEventsDisabled: new Set(),
    branches: new Set()
});
const $d715e0554b679f1f$export$177fb62ff3ec1f22 = /*#__PURE__*/ $g2vWm$react.forwardRef((props, forwardedRef)=>{
    var _node$ownerDocument;
    const { disableOutsidePointerEvents: disableOutsidePointerEvents = false , onEscapeKeyDown: onEscapeKeyDown , onPointerDownOutside: onPointerDownOutside , onFocusOutside: onFocusOutside , onInteractOutside: onInteractOutside , onDismiss: onDismiss , ...layerProps } = props;
    const context = $g2vWm$react.useContext($d715e0554b679f1f$var$DismissableLayerContext);
    const [node1, setNode] = $g2vWm$react.useState(null);
    const ownerDocument = (_node$ownerDocument = node1 === null || node1 === void 0 ? void 0 : node1.ownerDocument) !== null && _node$ownerDocument !== void 0 ? _node$ownerDocument : globalThis === null || globalThis === void 0 ? void 0 : globalThis.document;
    const [, force] = $g2vWm$react.useState({});
    const composedRefs = $g2vWm$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setNode(node)
    );
    const layers = Array.from(context.layers);
    const [highestLayerWithOutsidePointerEventsDisabled] = [
        ...context.layersWithOutsidePointerEventsDisabled
    ].slice(-1); // prettier-ignore
    const highestLayerWithOutsidePointerEventsDisabledIndex = layers.indexOf(highestLayerWithOutsidePointerEventsDisabled); // prettier-ignore
    const index = node1 ? layers.indexOf(node1) : -1;
    const isBodyPointerEventsDisabled = context.layersWithOutsidePointerEventsDisabled.size > 0;
    const isPointerEventsEnabled = index >= highestLayerWithOutsidePointerEventsDisabledIndex;
    const pointerDownOutside = $d715e0554b679f1f$var$usePointerDownOutside((event)=>{
        const target = event.target;
        const isPointerDownOnBranch = [
            ...context.branches
        ].some((branch)=>branch.contains(target)
        );
        if (!isPointerEventsEnabled || isPointerDownOnBranch) return;
        onPointerDownOutside === null || onPointerDownOutside === void 0 || onPointerDownOutside(event);
        onInteractOutside === null || onInteractOutside === void 0 || onInteractOutside(event);
        if (!event.defaultPrevented) onDismiss === null || onDismiss === void 0 || onDismiss();
    }, ownerDocument);
    const focusOutside = $d715e0554b679f1f$var$useFocusOutside((event)=>{
        const target = event.target;
        const isFocusInBranch = [
            ...context.branches
        ].some((branch)=>branch.contains(target)
        );
        if (isFocusInBranch) return;
        onFocusOutside === null || onFocusOutside === void 0 || onFocusOutside(event);
        onInteractOutside === null || onInteractOutside === void 0 || onInteractOutside(event);
        if (!event.defaultPrevented) onDismiss === null || onDismiss === void 0 || onDismiss();
    }, ownerDocument);
    $g2vWm$radixuireactuseescapekeydown.useEscapeKeydown((event)=>{
        const isHighestLayer = index === context.layers.size - 1;
        if (!isHighestLayer) return;
        onEscapeKeyDown === null || onEscapeKeyDown === void 0 || onEscapeKeyDown(event);
        if (!event.defaultPrevented && onDismiss) {
            event.preventDefault();
            onDismiss();
        }
    }, ownerDocument);
    $g2vWm$react.useEffect(()=>{
        if (!node1) return;
        if (disableOutsidePointerEvents) {
            if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
                $d715e0554b679f1f$var$originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;
                ownerDocument.body.style.pointerEvents = 'none';
            }
            context.layersWithOutsidePointerEventsDisabled.add(node1);
        }
        context.layers.add(node1);
        $d715e0554b679f1f$var$dispatchUpdate();
        return ()=>{
            if (disableOutsidePointerEvents && context.layersWithOutsidePointerEventsDisabled.size === 1) ownerDocument.body.style.pointerEvents = $d715e0554b679f1f$var$originalBodyPointerEvents;
        };
    }, [
        node1,
        ownerDocument,
        disableOutsidePointerEvents,
        context
    ]);
    /**
   * We purposefully prevent combining this effect with the `disableOutsidePointerEvents` effect
   * because a change to `disableOutsidePointerEvents` would remove this layer from the stack
   * and add it to the end again so the layering order wouldn't be _creation order_.
   * We only want them to be removed from context stacks when unmounted.
   */ $g2vWm$react.useEffect(()=>{
        return ()=>{
            if (!node1) return;
            context.layers.delete(node1);
            context.layersWithOutsidePointerEventsDisabled.delete(node1);
            $d715e0554b679f1f$var$dispatchUpdate();
        };
    }, [
        node1,
        context
    ]);
    $g2vWm$react.useEffect(()=>{
        const handleUpdate = ()=>force({})
        ;
        document.addEventListener($d715e0554b679f1f$var$CONTEXT_UPDATE, handleUpdate);
        return ()=>document.removeEventListener($d715e0554b679f1f$var$CONTEXT_UPDATE, handleUpdate)
        ;
    }, []);
    return /*#__PURE__*/ $g2vWm$react.createElement($g2vWm$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($g2vWm$babelruntimehelpersextends))({}, layerProps, {
        ref: composedRefs,
        style: {
            pointerEvents: isBodyPointerEventsDisabled ? isPointerEventsEnabled ? 'auto' : 'none' : undefined,
            ...props.style
        },
        onFocusCapture: $g2vWm$radixuiprimitive.composeEventHandlers(props.onFocusCapture, focusOutside.onFocusCapture),
        onBlurCapture: $g2vWm$radixuiprimitive.composeEventHandlers(props.onBlurCapture, focusOutside.onBlurCapture),
        onPointerDownCapture: $g2vWm$radixuiprimitive.composeEventHandlers(props.onPointerDownCapture, pointerDownOutside.onPointerDownCapture)
    }));
});
/*#__PURE__*/ Object.assign($d715e0554b679f1f$export$177fb62ff3ec1f22, {
    displayName: $d715e0554b679f1f$var$DISMISSABLE_LAYER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DismissableLayerBranch
 * -----------------------------------------------------------------------------------------------*/ const $d715e0554b679f1f$var$BRANCH_NAME = 'DismissableLayerBranch';
const $d715e0554b679f1f$export$4d5eb2109db14228 = /*#__PURE__*/ $g2vWm$react.forwardRef((props, forwardedRef)=>{
    const context = $g2vWm$react.useContext($d715e0554b679f1f$var$DismissableLayerContext);
    const ref = $g2vWm$react.useRef(null);
    const composedRefs = $g2vWm$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref);
    $g2vWm$react.useEffect(()=>{
        const node = ref.current;
        if (node) {
            context.branches.add(node);
            return ()=>{
                context.branches.delete(node);
            };
        }
    }, [
        context.branches
    ]);
    return /*#__PURE__*/ $g2vWm$react.createElement($g2vWm$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($g2vWm$babelruntimehelpersextends))({}, props, {
        ref: composedRefs
    }));
});
/*#__PURE__*/ Object.assign($d715e0554b679f1f$export$4d5eb2109db14228, {
    displayName: $d715e0554b679f1f$var$BRANCH_NAME
});
/* -----------------------------------------------------------------------------------------------*/ /**
 * Listens for `pointerdown` outside a react subtree. We use `pointerdown` rather than `pointerup`
 * to mimic layer dismissing behaviour present in OS.
 * Returns props to pass to the node we want to check for outside events.
 */ function $d715e0554b679f1f$var$usePointerDownOutside(onPointerDownOutside, ownerDocument = globalThis === null || globalThis === void 0 ? void 0 : globalThis.document) {
    const handlePointerDownOutside = $g2vWm$radixuireactusecallbackref.useCallbackRef(onPointerDownOutside);
    const isPointerInsideReactTreeRef = $g2vWm$react.useRef(false);
    const handleClickRef = $g2vWm$react.useRef(()=>{});
    $g2vWm$react.useEffect(()=>{
        const handlePointerDown = (event)=>{
            if (event.target && !isPointerInsideReactTreeRef.current) {
                const eventDetail = {
                    originalEvent: event
                };
                function handleAndDispatchPointerDownOutsideEvent() {
                    $d715e0554b679f1f$var$handleAndDispatchCustomEvent($d715e0554b679f1f$var$POINTER_DOWN_OUTSIDE, handlePointerDownOutside, eventDetail, {
                        discrete: true
                    });
                }
                /**
         * On touch devices, we need to wait for a click event because browsers implement
         * a ~350ms delay between the time the user stops touching the display and when the
         * browser executres events. We need to ensure we don't reactivate pointer-events within
         * this timeframe otherwise the browser may execute events that should have been prevented.
         *
         * Additionally, this also lets us deal automatically with cancellations when a click event
         * isn't raised because the page was considered scrolled/drag-scrolled, long-pressed, etc.
         *
         * This is why we also continuously remove the previous listener, because we cannot be
         * certain that it was raised, and therefore cleaned-up.
         */ if (event.pointerType === 'touch') {
                    ownerDocument.removeEventListener('click', handleClickRef.current);
                    handleClickRef.current = handleAndDispatchPointerDownOutsideEvent;
                    ownerDocument.addEventListener('click', handleClickRef.current, {
                        once: true
                    });
                } else handleAndDispatchPointerDownOutsideEvent();
            } else // We need to remove the event listener in case the outside click has been canceled.
            // See: https://github.com/radix-ui/primitives/issues/2171
            ownerDocument.removeEventListener('click', handleClickRef.current);
            isPointerInsideReactTreeRef.current = false;
        };
        /**
     * if this hook executes in a component that mounts via a `pointerdown` event, the event
     * would bubble up to the document and trigger a `pointerDownOutside` event. We avoid
     * this by delaying the event listener registration on the document.
     * This is not React specific, but rather how the DOM works, ie:
     * ```
     * button.addEventListener('pointerdown', () => {
     *   console.log('I will log');
     *   document.addEventListener('pointerdown', () => {
     *     console.log('I will also log');
     *   })
     * });
     */ const timerId = window.setTimeout(()=>{
            ownerDocument.addEventListener('pointerdown', handlePointerDown);
        }, 0);
        return ()=>{
            window.clearTimeout(timerId);
            ownerDocument.removeEventListener('pointerdown', handlePointerDown);
            ownerDocument.removeEventListener('click', handleClickRef.current);
        };
    }, [
        ownerDocument,
        handlePointerDownOutside
    ]);
    return {
        // ensures we check React component tree (not just DOM tree)
        onPointerDownCapture: ()=>isPointerInsideReactTreeRef.current = true
    };
}
/**
 * Listens for when focus happens outside a react subtree.
 * Returns props to pass to the root (node) of the subtree we want to check.
 */ function $d715e0554b679f1f$var$useFocusOutside(onFocusOutside, ownerDocument = globalThis === null || globalThis === void 0 ? void 0 : globalThis.document) {
    const handleFocusOutside = $g2vWm$radixuireactusecallbackref.useCallbackRef(onFocusOutside);
    const isFocusInsideReactTreeRef = $g2vWm$react.useRef(false);
    $g2vWm$react.useEffect(()=>{
        const handleFocus = (event)=>{
            if (event.target && !isFocusInsideReactTreeRef.current) {
                const eventDetail = {
                    originalEvent: event
                };
                $d715e0554b679f1f$var$handleAndDispatchCustomEvent($d715e0554b679f1f$var$FOCUS_OUTSIDE, handleFocusOutside, eventDetail, {
                    discrete: false
                });
            }
        };
        ownerDocument.addEventListener('focusin', handleFocus);
        return ()=>ownerDocument.removeEventListener('focusin', handleFocus)
        ;
    }, [
        ownerDocument,
        handleFocusOutside
    ]);
    return {
        onFocusCapture: ()=>isFocusInsideReactTreeRef.current = true
        ,
        onBlurCapture: ()=>isFocusInsideReactTreeRef.current = false
    };
}
function $d715e0554b679f1f$var$dispatchUpdate() {
    const event = new CustomEvent($d715e0554b679f1f$var$CONTEXT_UPDATE);
    document.dispatchEvent(event);
}
function $d715e0554b679f1f$var$handleAndDispatchCustomEvent(name, handler, detail, { discrete: discrete  }) {
    const target = detail.originalEvent.target;
    const event = new CustomEvent(name, {
        bubbles: false,
        cancelable: true,
        detail: detail
    });
    if (handler) target.addEventListener(name, handler, {
        once: true
    });
    if (discrete) $g2vWm$radixuireactprimitive.dispatchDiscreteCustomEvent(target, event);
    else target.dispatchEvent(event);
}
const $d715e0554b679f1f$export$be92b6f5f03c0fe9 = $d715e0554b679f1f$export$177fb62ff3ec1f22;
const $d715e0554b679f1f$export$aecb2ddcb55c95be = $d715e0554b679f1f$export$4d5eb2109db14228;




//# sourceMappingURL=index.js.map
