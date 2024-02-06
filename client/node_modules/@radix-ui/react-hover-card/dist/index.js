var $eFX7w$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $eFX7w$react = require("react");
var $eFX7w$radixuiprimitive = require("@radix-ui/primitive");
var $eFX7w$radixuireactcontext = require("@radix-ui/react-context");
var $eFX7w$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $eFX7w$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $eFX7w$radixuireactpopper = require("@radix-ui/react-popper");
var $eFX7w$radixuireactportal = require("@radix-ui/react-portal");
var $eFX7w$radixuireactpresence = require("@radix-ui/react-presence");
var $eFX7w$radixuireactprimitive = require("@radix-ui/react-primitive");
var $eFX7w$radixuireactdismissablelayer = require("@radix-ui/react-dismissable-layer");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createHoverCardScope", () => $e5715e9205c1e1fe$export$47b6998a836b7260);
$parcel$export(module.exports, "HoverCard", () => $e5715e9205c1e1fe$export$57a077cc9fbe653e);
$parcel$export(module.exports, "HoverCardTrigger", () => $e5715e9205c1e1fe$export$ef9f7fd8e4ba882f);
$parcel$export(module.exports, "HoverCardPortal", () => $e5715e9205c1e1fe$export$b384c6e0a789f88b);
$parcel$export(module.exports, "HoverCardContent", () => $e5715e9205c1e1fe$export$aa4724a5938c586);
$parcel$export(module.exports, "HoverCardArrow", () => $e5715e9205c1e1fe$export$b9744d3e7456d806);
$parcel$export(module.exports, "Root", () => $e5715e9205c1e1fe$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Trigger", () => $e5715e9205c1e1fe$export$41fb9f06171c75f4);
$parcel$export(module.exports, "Portal", () => $e5715e9205c1e1fe$export$602eac185826482c);
$parcel$export(module.exports, "Content", () => $e5715e9205c1e1fe$export$7c6e2c02157bb7d2);
$parcel$export(module.exports, "Arrow", () => $e5715e9205c1e1fe$export$21b07c8f274aebd5);












/* -------------------------------------------------------------------------------------------------
 * HoverCard
 * -----------------------------------------------------------------------------------------------*/ let $e5715e9205c1e1fe$var$originalBodyUserSelect;
const $e5715e9205c1e1fe$var$HOVERCARD_NAME = 'HoverCard';
const [$e5715e9205c1e1fe$var$createHoverCardContext, $e5715e9205c1e1fe$export$47b6998a836b7260] = $eFX7w$radixuireactcontext.createContextScope($e5715e9205c1e1fe$var$HOVERCARD_NAME, [
    $eFX7w$radixuireactpopper.createPopperScope
]);
const $e5715e9205c1e1fe$var$usePopperScope = $eFX7w$radixuireactpopper.createPopperScope();
const [$e5715e9205c1e1fe$var$HoverCardProvider, $e5715e9205c1e1fe$var$useHoverCardContext] = $e5715e9205c1e1fe$var$createHoverCardContext($e5715e9205c1e1fe$var$HOVERCARD_NAME);
const $e5715e9205c1e1fe$export$57a077cc9fbe653e = (props)=>{
    const { __scopeHoverCard: __scopeHoverCard , children: children , open: openProp , defaultOpen: defaultOpen , onOpenChange: onOpenChange , openDelay: openDelay = 700 , closeDelay: closeDelay = 300  } = props;
    const popperScope = $e5715e9205c1e1fe$var$usePopperScope(__scopeHoverCard);
    const openTimerRef = $eFX7w$react.useRef(0);
    const closeTimerRef = $eFX7w$react.useRef(0);
    const hasSelectionRef = $eFX7w$react.useRef(false);
    const isPointerDownOnContentRef = $eFX7w$react.useRef(false);
    const [open = false, setOpen] = $eFX7w$radixuireactusecontrollablestate.useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    const handleOpen = $eFX7w$react.useCallback(()=>{
        clearTimeout(closeTimerRef.current);
        openTimerRef.current = window.setTimeout(()=>setOpen(true)
        , openDelay);
    }, [
        openDelay,
        setOpen
    ]);
    const handleClose = $eFX7w$react.useCallback(()=>{
        clearTimeout(openTimerRef.current);
        if (!hasSelectionRef.current && !isPointerDownOnContentRef.current) closeTimerRef.current = window.setTimeout(()=>setOpen(false)
        , closeDelay);
    }, [
        closeDelay,
        setOpen
    ]);
    const handleDismiss = $eFX7w$react.useCallback(()=>setOpen(false)
    , [
        setOpen
    ]); // cleanup any queued state updates on unmount
    $eFX7w$react.useEffect(()=>{
        return ()=>{
            clearTimeout(openTimerRef.current);
            clearTimeout(closeTimerRef.current);
        };
    }, []);
    return /*#__PURE__*/ $eFX7w$react.createElement($e5715e9205c1e1fe$var$HoverCardProvider, {
        scope: __scopeHoverCard,
        open: open,
        onOpenChange: setOpen,
        onOpen: handleOpen,
        onClose: handleClose,
        onDismiss: handleDismiss,
        hasSelectionRef: hasSelectionRef,
        isPointerDownOnContentRef: isPointerDownOnContentRef
    }, /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactpopper.Root, popperScope, children));
};
/*#__PURE__*/ Object.assign($e5715e9205c1e1fe$export$57a077cc9fbe653e, {
    displayName: $e5715e9205c1e1fe$var$HOVERCARD_NAME
});
/* -------------------------------------------------------------------------------------------------
 * HoverCardTrigger
 * -----------------------------------------------------------------------------------------------*/ const $e5715e9205c1e1fe$var$TRIGGER_NAME = 'HoverCardTrigger';
const $e5715e9205c1e1fe$export$ef9f7fd8e4ba882f = /*#__PURE__*/ $eFX7w$react.forwardRef((props, forwardedRef)=>{
    const { __scopeHoverCard: __scopeHoverCard , ...triggerProps } = props;
    const context = $e5715e9205c1e1fe$var$useHoverCardContext($e5715e9205c1e1fe$var$TRIGGER_NAME, __scopeHoverCard);
    const popperScope = $e5715e9205c1e1fe$var$usePopperScope(__scopeHoverCard);
    return /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactpopper.Anchor, ($parcel$interopDefault($eFX7w$babelruntimehelpersextends))({
        asChild: true
    }, popperScope), /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactprimitive.Primitive.a, ($parcel$interopDefault($eFX7w$babelruntimehelpersextends))({
        "data-state": context.open ? 'open' : 'closed'
    }, triggerProps, {
        ref: forwardedRef,
        onPointerEnter: $eFX7w$radixuiprimitive.composeEventHandlers(props.onPointerEnter, $e5715e9205c1e1fe$var$excludeTouch(context.onOpen)),
        onPointerLeave: $eFX7w$radixuiprimitive.composeEventHandlers(props.onPointerLeave, $e5715e9205c1e1fe$var$excludeTouch(context.onClose)),
        onFocus: $eFX7w$radixuiprimitive.composeEventHandlers(props.onFocus, context.onOpen),
        onBlur: $eFX7w$radixuiprimitive.composeEventHandlers(props.onBlur, context.onClose) // prevent focus event on touch devices
        ,
        onTouchStart: $eFX7w$radixuiprimitive.composeEventHandlers(props.onTouchStart, (event)=>event.preventDefault()
        )
    })));
});
/*#__PURE__*/ Object.assign($e5715e9205c1e1fe$export$ef9f7fd8e4ba882f, {
    displayName: $e5715e9205c1e1fe$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * HoverCardPortal
 * -----------------------------------------------------------------------------------------------*/ const $e5715e9205c1e1fe$var$PORTAL_NAME = 'HoverCardPortal';
const [$e5715e9205c1e1fe$var$PortalProvider, $e5715e9205c1e1fe$var$usePortalContext] = $e5715e9205c1e1fe$var$createHoverCardContext($e5715e9205c1e1fe$var$PORTAL_NAME, {
    forceMount: undefined
});
const $e5715e9205c1e1fe$export$b384c6e0a789f88b = (props)=>{
    const { __scopeHoverCard: __scopeHoverCard , forceMount: forceMount , children: children , container: container  } = props;
    const context = $e5715e9205c1e1fe$var$useHoverCardContext($e5715e9205c1e1fe$var$PORTAL_NAME, __scopeHoverCard);
    return /*#__PURE__*/ $eFX7w$react.createElement($e5715e9205c1e1fe$var$PortalProvider, {
        scope: __scopeHoverCard,
        forceMount: forceMount
    }, /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactportal.Portal, {
        asChild: true,
        container: container
    }, children)));
};
/*#__PURE__*/ Object.assign($e5715e9205c1e1fe$export$b384c6e0a789f88b, {
    displayName: $e5715e9205c1e1fe$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * HoverCardContent
 * -----------------------------------------------------------------------------------------------*/ const $e5715e9205c1e1fe$var$CONTENT_NAME = 'HoverCardContent';
const $e5715e9205c1e1fe$export$aa4724a5938c586 = /*#__PURE__*/ $eFX7w$react.forwardRef((props, forwardedRef)=>{
    const portalContext = $e5715e9205c1e1fe$var$usePortalContext($e5715e9205c1e1fe$var$CONTENT_NAME, props.__scopeHoverCard);
    const { forceMount: forceMount = portalContext.forceMount , ...contentProps } = props;
    const context = $e5715e9205c1e1fe$var$useHoverCardContext($e5715e9205c1e1fe$var$CONTENT_NAME, props.__scopeHoverCard);
    return /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $eFX7w$react.createElement($e5715e9205c1e1fe$var$HoverCardContentImpl, ($parcel$interopDefault($eFX7w$babelruntimehelpersextends))({
        "data-state": context.open ? 'open' : 'closed'
    }, contentProps, {
        onPointerEnter: $eFX7w$radixuiprimitive.composeEventHandlers(props.onPointerEnter, $e5715e9205c1e1fe$var$excludeTouch(context.onOpen)),
        onPointerLeave: $eFX7w$radixuiprimitive.composeEventHandlers(props.onPointerLeave, $e5715e9205c1e1fe$var$excludeTouch(context.onClose)),
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($e5715e9205c1e1fe$export$aa4724a5938c586, {
    displayName: $e5715e9205c1e1fe$var$CONTENT_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $e5715e9205c1e1fe$var$HoverCardContentImpl = /*#__PURE__*/ $eFX7w$react.forwardRef((props, forwardedRef)=>{
    const { __scopeHoverCard: __scopeHoverCard , onEscapeKeyDown: onEscapeKeyDown , onPointerDownOutside: onPointerDownOutside , onFocusOutside: onFocusOutside , onInteractOutside: onInteractOutside , ...contentProps } = props;
    const context = $e5715e9205c1e1fe$var$useHoverCardContext($e5715e9205c1e1fe$var$CONTENT_NAME, __scopeHoverCard);
    const popperScope = $e5715e9205c1e1fe$var$usePopperScope(__scopeHoverCard);
    const ref = $eFX7w$react.useRef(null);
    const composedRefs = $eFX7w$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref);
    const [containSelection, setContainSelection] = $eFX7w$react.useState(false);
    $eFX7w$react.useEffect(()=>{
        if (containSelection) {
            const body = document.body; // Safari requires prefix
            $e5715e9205c1e1fe$var$originalBodyUserSelect = body.style.userSelect || body.style.webkitUserSelect;
            body.style.userSelect = 'none';
            body.style.webkitUserSelect = 'none';
            return ()=>{
                body.style.userSelect = $e5715e9205c1e1fe$var$originalBodyUserSelect;
                body.style.webkitUserSelect = $e5715e9205c1e1fe$var$originalBodyUserSelect;
            };
        }
    }, [
        containSelection
    ]);
    $eFX7w$react.useEffect(()=>{
        if (ref.current) {
            const handlePointerUp = ()=>{
                setContainSelection(false);
                context.isPointerDownOnContentRef.current = false; // Delay a frame to ensure we always access the latest selection
                setTimeout(()=>{
                    var _document$getSelectio;
                    const hasSelection = ((_document$getSelectio = document.getSelection()) === null || _document$getSelectio === void 0 ? void 0 : _document$getSelectio.toString()) !== '';
                    if (hasSelection) context.hasSelectionRef.current = true;
                });
            };
            document.addEventListener('pointerup', handlePointerUp);
            return ()=>{
                document.removeEventListener('pointerup', handlePointerUp);
                context.hasSelectionRef.current = false;
                context.isPointerDownOnContentRef.current = false;
            };
        }
    }, [
        context.isPointerDownOnContentRef,
        context.hasSelectionRef
    ]);
    $eFX7w$react.useEffect(()=>{
        if (ref.current) {
            const tabbables = $e5715e9205c1e1fe$var$getTabbableNodes(ref.current);
            tabbables.forEach((tabbable)=>tabbable.setAttribute('tabindex', '-1')
            );
        }
    });
    return /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactdismissablelayer.DismissableLayer, {
        asChild: true,
        disableOutsidePointerEvents: false,
        onInteractOutside: onInteractOutside,
        onEscapeKeyDown: onEscapeKeyDown,
        onPointerDownOutside: onPointerDownOutside,
        onFocusOutside: $eFX7w$radixuiprimitive.composeEventHandlers(onFocusOutside, (event)=>{
            event.preventDefault();
        }),
        onDismiss: context.onDismiss
    }, /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactpopper.Content, ($parcel$interopDefault($eFX7w$babelruntimehelpersextends))({}, popperScope, contentProps, {
        onPointerDown: $eFX7w$radixuiprimitive.composeEventHandlers(contentProps.onPointerDown, (event)=>{
            // Contain selection to current layer
            if (event.currentTarget.contains(event.target)) setContainSelection(true);
            context.hasSelectionRef.current = false;
            context.isPointerDownOnContentRef.current = true;
        }),
        ref: composedRefs,
        style: {
            ...contentProps.style,
            userSelect: containSelection ? 'text' : undefined,
            // Safari requires prefix
            WebkitUserSelect: containSelection ? 'text' : undefined,
            '--radix-hover-card-content-transform-origin': 'var(--radix-popper-transform-origin)',
            '--radix-hover-card-content-available-width': 'var(--radix-popper-available-width)',
            '--radix-hover-card-content-available-height': 'var(--radix-popper-available-height)',
            '--radix-hover-card-trigger-width': 'var(--radix-popper-anchor-width)',
            '--radix-hover-card-trigger-height': 'var(--radix-popper-anchor-height)'
        }
    })));
});
/* -------------------------------------------------------------------------------------------------
 * HoverCardArrow
 * -----------------------------------------------------------------------------------------------*/ const $e5715e9205c1e1fe$var$ARROW_NAME = 'HoverCardArrow';
const $e5715e9205c1e1fe$export$b9744d3e7456d806 = /*#__PURE__*/ $eFX7w$react.forwardRef((props, forwardedRef)=>{
    const { __scopeHoverCard: __scopeHoverCard , ...arrowProps } = props;
    const popperScope = $e5715e9205c1e1fe$var$usePopperScope(__scopeHoverCard);
    return /*#__PURE__*/ $eFX7w$react.createElement($eFX7w$radixuireactpopper.Arrow, ($parcel$interopDefault($eFX7w$babelruntimehelpersextends))({}, popperScope, arrowProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($e5715e9205c1e1fe$export$b9744d3e7456d806, {
    displayName: $e5715e9205c1e1fe$var$ARROW_NAME
});
/* -----------------------------------------------------------------------------------------------*/ function $e5715e9205c1e1fe$var$excludeTouch(eventHandler) {
    return (event)=>event.pointerType === 'touch' ? undefined : eventHandler()
    ;
}
/**
 * Returns a list of nodes that can be in the tab sequence.
 * @see: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
 */ function $e5715e9205c1e1fe$var$getTabbableNodes(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node)=>{
            // `.tabIndex` is not the same as the `tabindex` attribute. It works on the
            // runtime's understanding of tabbability, so this automatically accounts
            // for any kind of element that could be tabbed to.
            return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
    });
    while(walker.nextNode())nodes.push(walker.currentNode);
    return nodes;
}
const $e5715e9205c1e1fe$export$be92b6f5f03c0fe9 = $e5715e9205c1e1fe$export$57a077cc9fbe653e;
const $e5715e9205c1e1fe$export$41fb9f06171c75f4 = $e5715e9205c1e1fe$export$ef9f7fd8e4ba882f;
const $e5715e9205c1e1fe$export$602eac185826482c = $e5715e9205c1e1fe$export$b384c6e0a789f88b;
const $e5715e9205c1e1fe$export$7c6e2c02157bb7d2 = $e5715e9205c1e1fe$export$aa4724a5938c586;
const $e5715e9205c1e1fe$export$21b07c8f274aebd5 = $e5715e9205c1e1fe$export$b9744d3e7456d806;




//# sourceMappingURL=index.js.map
