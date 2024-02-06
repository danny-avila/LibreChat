var $aJPOC$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $aJPOC$react = require("react");
var $aJPOC$radixuiprimitive = require("@radix-ui/primitive");
var $aJPOC$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $aJPOC$radixuireactcontext = require("@radix-ui/react-context");
var $aJPOC$radixuireactdismissablelayer = require("@radix-ui/react-dismissable-layer");
var $aJPOC$radixuireactfocusguards = require("@radix-ui/react-focus-guards");
var $aJPOC$radixuireactfocusscope = require("@radix-ui/react-focus-scope");
var $aJPOC$radixuireactid = require("@radix-ui/react-id");
var $aJPOC$radixuireactpopper = require("@radix-ui/react-popper");
var $aJPOC$radixuireactportal = require("@radix-ui/react-portal");
var $aJPOC$radixuireactpresence = require("@radix-ui/react-presence");
var $aJPOC$radixuireactprimitive = require("@radix-ui/react-primitive");
var $aJPOC$radixuireactslot = require("@radix-ui/react-slot");
var $aJPOC$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $aJPOC$ariahidden = require("aria-hidden");
var $aJPOC$reactremovescroll = require("react-remove-scroll");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createPopoverScope", () => $7d632c09314cddaf$export$c8393c9e73286932);
$parcel$export(module.exports, "Popover", () => $7d632c09314cddaf$export$5b6b19405a83ff9d);
$parcel$export(module.exports, "PopoverAnchor", () => $7d632c09314cddaf$export$96e5381f42521a79);
$parcel$export(module.exports, "PopoverTrigger", () => $7d632c09314cddaf$export$7dacb05d26466c3);
$parcel$export(module.exports, "PopoverPortal", () => $7d632c09314cddaf$export$dd679ffb4362d2d4);
$parcel$export(module.exports, "PopoverContent", () => $7d632c09314cddaf$export$d7e1f420b25549ff);
$parcel$export(module.exports, "PopoverClose", () => $7d632c09314cddaf$export$d6ac43ebaa40d53e);
$parcel$export(module.exports, "PopoverArrow", () => $7d632c09314cddaf$export$3152841115e061b2);
$parcel$export(module.exports, "Root", () => $7d632c09314cddaf$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Anchor", () => $7d632c09314cddaf$export$b688253958b8dfe7);
$parcel$export(module.exports, "Trigger", () => $7d632c09314cddaf$export$41fb9f06171c75f4);
$parcel$export(module.exports, "Portal", () => $7d632c09314cddaf$export$602eac185826482c);
$parcel$export(module.exports, "Content", () => $7d632c09314cddaf$export$7c6e2c02157bb7d2);
$parcel$export(module.exports, "Close", () => $7d632c09314cddaf$export$f39c2d165cd861fe);
$parcel$export(module.exports, "Arrow", () => $7d632c09314cddaf$export$21b07c8f274aebd5);


















/* -------------------------------------------------------------------------------------------------
 * Popover
 * -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$POPOVER_NAME = 'Popover';
const [$7d632c09314cddaf$var$createPopoverContext, $7d632c09314cddaf$export$c8393c9e73286932] = $aJPOC$radixuireactcontext.createContextScope($7d632c09314cddaf$var$POPOVER_NAME, [
    $aJPOC$radixuireactpopper.createPopperScope
]);
const $7d632c09314cddaf$var$usePopperScope = $aJPOC$radixuireactpopper.createPopperScope();
const [$7d632c09314cddaf$var$PopoverProvider, $7d632c09314cddaf$var$usePopoverContext] = $7d632c09314cddaf$var$createPopoverContext($7d632c09314cddaf$var$POPOVER_NAME);
const $7d632c09314cddaf$export$5b6b19405a83ff9d = (props)=>{
    const { __scopePopover: __scopePopover , children: children , open: openProp , defaultOpen: defaultOpen , onOpenChange: onOpenChange , modal: modal = false  } = props;
    const popperScope = $7d632c09314cddaf$var$usePopperScope(__scopePopover);
    const triggerRef = $aJPOC$react.useRef(null);
    const [hasCustomAnchor, setHasCustomAnchor] = $aJPOC$react.useState(false);
    const [open = false, setOpen] = $aJPOC$radixuireactusecontrollablestate.useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    return /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactpopper.Root, popperScope, /*#__PURE__*/ $aJPOC$react.createElement($7d632c09314cddaf$var$PopoverProvider, {
        scope: __scopePopover,
        contentId: $aJPOC$radixuireactid.useId(),
        triggerRef: triggerRef,
        open: open,
        onOpenChange: setOpen,
        onOpenToggle: $aJPOC$react.useCallback(()=>setOpen((prevOpen)=>!prevOpen
            )
        , [
            setOpen
        ]),
        hasCustomAnchor: hasCustomAnchor,
        onCustomAnchorAdd: $aJPOC$react.useCallback(()=>setHasCustomAnchor(true)
        , []),
        onCustomAnchorRemove: $aJPOC$react.useCallback(()=>setHasCustomAnchor(false)
        , []),
        modal: modal
    }, children));
};
/*#__PURE__*/ Object.assign($7d632c09314cddaf$export$5b6b19405a83ff9d, {
    displayName: $7d632c09314cddaf$var$POPOVER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverAnchor
 * -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$ANCHOR_NAME = 'PopoverAnchor';
const $7d632c09314cddaf$export$96e5381f42521a79 = /*#__PURE__*/ $aJPOC$react.forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , ...anchorProps } = props;
    const context = $7d632c09314cddaf$var$usePopoverContext($7d632c09314cddaf$var$ANCHOR_NAME, __scopePopover);
    const popperScope = $7d632c09314cddaf$var$usePopperScope(__scopePopover);
    const { onCustomAnchorAdd: onCustomAnchorAdd , onCustomAnchorRemove: onCustomAnchorRemove  } = context;
    $aJPOC$react.useEffect(()=>{
        onCustomAnchorAdd();
        return ()=>onCustomAnchorRemove()
        ;
    }, [
        onCustomAnchorAdd,
        onCustomAnchorRemove
    ]);
    return /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactpopper.Anchor, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({}, popperScope, anchorProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($7d632c09314cddaf$export$96e5381f42521a79, {
    displayName: $7d632c09314cddaf$var$ANCHOR_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverTrigger
 * -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$TRIGGER_NAME = 'PopoverTrigger';
const $7d632c09314cddaf$export$7dacb05d26466c3 = /*#__PURE__*/ $aJPOC$react.forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , ...triggerProps } = props;
    const context = $7d632c09314cddaf$var$usePopoverContext($7d632c09314cddaf$var$TRIGGER_NAME, __scopePopover);
    const popperScope = $7d632c09314cddaf$var$usePopperScope(__scopePopover);
    const composedTriggerRef = $aJPOC$radixuireactcomposerefs.useComposedRefs(forwardedRef, context.triggerRef);
    const trigger = /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": context.open,
        "aria-controls": context.contentId,
        "data-state": $7d632c09314cddaf$var$getState(context.open)
    }, triggerProps, {
        ref: composedTriggerRef,
        onClick: $aJPOC$radixuiprimitive.composeEventHandlers(props.onClick, context.onOpenToggle)
    }));
    return context.hasCustomAnchor ? trigger : /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactpopper.Anchor, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({
        asChild: true
    }, popperScope), trigger);
});
/*#__PURE__*/ Object.assign($7d632c09314cddaf$export$7dacb05d26466c3, {
    displayName: $7d632c09314cddaf$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverPortal
 * -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$PORTAL_NAME = 'PopoverPortal';
const [$7d632c09314cddaf$var$PortalProvider, $7d632c09314cddaf$var$usePortalContext] = $7d632c09314cddaf$var$createPopoverContext($7d632c09314cddaf$var$PORTAL_NAME, {
    forceMount: undefined
});
const $7d632c09314cddaf$export$dd679ffb4362d2d4 = (props)=>{
    const { __scopePopover: __scopePopover , forceMount: forceMount , children: children , container: container  } = props;
    const context = $7d632c09314cddaf$var$usePopoverContext($7d632c09314cddaf$var$PORTAL_NAME, __scopePopover);
    return /*#__PURE__*/ $aJPOC$react.createElement($7d632c09314cddaf$var$PortalProvider, {
        scope: __scopePopover,
        forceMount: forceMount
    }, /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactportal.Portal, {
        asChild: true,
        container: container
    }, children)));
};
/*#__PURE__*/ Object.assign($7d632c09314cddaf$export$dd679ffb4362d2d4, {
    displayName: $7d632c09314cddaf$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverContent
 * -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$CONTENT_NAME = 'PopoverContent';
const $7d632c09314cddaf$export$d7e1f420b25549ff = /*#__PURE__*/ $aJPOC$react.forwardRef((props, forwardedRef)=>{
    const portalContext = $7d632c09314cddaf$var$usePortalContext($7d632c09314cddaf$var$CONTENT_NAME, props.__scopePopover);
    const { forceMount: forceMount = portalContext.forceMount , ...contentProps } = props;
    const context = $7d632c09314cddaf$var$usePopoverContext($7d632c09314cddaf$var$CONTENT_NAME, props.__scopePopover);
    return /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, context.modal ? /*#__PURE__*/ $aJPOC$react.createElement($7d632c09314cddaf$var$PopoverContentModal, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({}, contentProps, {
        ref: forwardedRef
    })) : /*#__PURE__*/ $aJPOC$react.createElement($7d632c09314cddaf$var$PopoverContentNonModal, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({}, contentProps, {
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($7d632c09314cddaf$export$d7e1f420b25549ff, {
    displayName: $7d632c09314cddaf$var$CONTENT_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$PopoverContentModal = /*#__PURE__*/ $aJPOC$react.forwardRef((props, forwardedRef)=>{
    const context = $7d632c09314cddaf$var$usePopoverContext($7d632c09314cddaf$var$CONTENT_NAME, props.__scopePopover);
    const contentRef = $aJPOC$react.useRef(null);
    const composedRefs = $aJPOC$radixuireactcomposerefs.useComposedRefs(forwardedRef, contentRef);
    const isRightClickOutsideRef = $aJPOC$react.useRef(false); // aria-hide everything except the content (better supported equivalent to setting aria-modal)
    $aJPOC$react.useEffect(()=>{
        const content = contentRef.current;
        if (content) return $aJPOC$ariahidden.hideOthers(content);
    }, []);
    return /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$reactremovescroll.RemoveScroll, {
        as: $aJPOC$radixuireactslot.Slot,
        allowPinchZoom: true
    }, /*#__PURE__*/ $aJPOC$react.createElement($7d632c09314cddaf$var$PopoverContentImpl, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({}, props, {
        ref: composedRefs // we make sure we're not trapping once it's been closed
        ,
        trapFocus: context.open,
        disableOutsidePointerEvents: true,
        onCloseAutoFocus: $aJPOC$radixuiprimitive.composeEventHandlers(props.onCloseAutoFocus, (event)=>{
            var _context$triggerRef$c;
            event.preventDefault();
            if (!isRightClickOutsideRef.current) (_context$triggerRef$c = context.triggerRef.current) === null || _context$triggerRef$c === void 0 || _context$triggerRef$c.focus();
        }),
        onPointerDownOutside: $aJPOC$radixuiprimitive.composeEventHandlers(props.onPointerDownOutside, (event)=>{
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            isRightClickOutsideRef.current = isRightClick;
        }, {
            checkForDefaultPrevented: false
        }) // When focus is trapped, a `focusout` event may still happen.
        ,
        onFocusOutside: $aJPOC$radixuiprimitive.composeEventHandlers(props.onFocusOutside, (event)=>event.preventDefault()
        , {
            checkForDefaultPrevented: false
        })
    })));
});
const $7d632c09314cddaf$var$PopoverContentNonModal = /*#__PURE__*/ $aJPOC$react.forwardRef((props, forwardedRef)=>{
    const context = $7d632c09314cddaf$var$usePopoverContext($7d632c09314cddaf$var$CONTENT_NAME, props.__scopePopover);
    const hasInteractedOutsideRef = $aJPOC$react.useRef(false);
    const hasPointerDownOutsideRef = $aJPOC$react.useRef(false);
    return /*#__PURE__*/ $aJPOC$react.createElement($7d632c09314cddaf$var$PopoverContentImpl, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({}, props, {
        ref: forwardedRef,
        trapFocus: false,
        disableOutsidePointerEvents: false,
        onCloseAutoFocus: (event)=>{
            var _props$onCloseAutoFoc;
            (_props$onCloseAutoFoc = props.onCloseAutoFocus) === null || _props$onCloseAutoFoc === void 0 || _props$onCloseAutoFoc.call(props, event);
            if (!event.defaultPrevented) {
                var _context$triggerRef$c2;
                if (!hasInteractedOutsideRef.current) (_context$triggerRef$c2 = context.triggerRef.current) === null || _context$triggerRef$c2 === void 0 || _context$triggerRef$c2.focus(); // Always prevent auto focus because we either focus manually or want user agent focus
                event.preventDefault();
            }
            hasInteractedOutsideRef.current = false;
            hasPointerDownOutsideRef.current = false;
        },
        onInteractOutside: (event)=>{
            var _props$onInteractOuts, _context$triggerRef$c3;
            (_props$onInteractOuts = props.onInteractOutside) === null || _props$onInteractOuts === void 0 || _props$onInteractOuts.call(props, event);
            if (!event.defaultPrevented) {
                hasInteractedOutsideRef.current = true;
                if (event.detail.originalEvent.type === 'pointerdown') hasPointerDownOutsideRef.current = true;
            } // Prevent dismissing when clicking the trigger.
            // As the trigger is already setup to close, without doing so would
            // cause it to close and immediately open.
            const target = event.target;
            const targetIsTrigger = (_context$triggerRef$c3 = context.triggerRef.current) === null || _context$triggerRef$c3 === void 0 ? void 0 : _context$triggerRef$c3.contains(target);
            if (targetIsTrigger) event.preventDefault(); // On Safari if the trigger is inside a container with tabIndex={0}, when clicked
            // we will get the pointer down outside event on the trigger, but then a subsequent
            // focus outside event on the container, we ignore any focus outside event when we've
            // already had a pointer down outside event.
            if (event.detail.originalEvent.type === 'focusin' && hasPointerDownOutsideRef.current) event.preventDefault();
        }
    }));
});
/* -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$PopoverContentImpl = /*#__PURE__*/ $aJPOC$react.forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , trapFocus: trapFocus , onOpenAutoFocus: onOpenAutoFocus , onCloseAutoFocus: onCloseAutoFocus , disableOutsidePointerEvents: disableOutsidePointerEvents , onEscapeKeyDown: onEscapeKeyDown , onPointerDownOutside: onPointerDownOutside , onFocusOutside: onFocusOutside , onInteractOutside: onInteractOutside , ...contentProps } = props;
    const context = $7d632c09314cddaf$var$usePopoverContext($7d632c09314cddaf$var$CONTENT_NAME, __scopePopover);
    const popperScope = $7d632c09314cddaf$var$usePopperScope(__scopePopover); // Make sure the whole tree has focus guards as our `Popover` may be
    // the last element in the DOM (beacuse of the `Portal`)
    $aJPOC$radixuireactfocusguards.useFocusGuards();
    return /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactfocusscope.FocusScope, {
        asChild: true,
        loop: true,
        trapped: trapFocus,
        onMountAutoFocus: onOpenAutoFocus,
        onUnmountAutoFocus: onCloseAutoFocus
    }, /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactdismissablelayer.DismissableLayer, {
        asChild: true,
        disableOutsidePointerEvents: disableOutsidePointerEvents,
        onInteractOutside: onInteractOutside,
        onEscapeKeyDown: onEscapeKeyDown,
        onPointerDownOutside: onPointerDownOutside,
        onFocusOutside: onFocusOutside,
        onDismiss: ()=>context.onOpenChange(false)
    }, /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactpopper.Content, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({
        "data-state": $7d632c09314cddaf$var$getState(context.open),
        role: "dialog",
        id: context.contentId
    }, popperScope, contentProps, {
        ref: forwardedRef,
        style: {
            ...contentProps.style,
            '--radix-popover-content-transform-origin': 'var(--radix-popper-transform-origin)',
            '--radix-popover-content-available-width': 'var(--radix-popper-available-width)',
            '--radix-popover-content-available-height': 'var(--radix-popper-available-height)',
            '--radix-popover-trigger-width': 'var(--radix-popper-anchor-width)',
            '--radix-popover-trigger-height': 'var(--radix-popper-anchor-height)'
        }
    }))));
});
/* -------------------------------------------------------------------------------------------------
 * PopoverClose
 * -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$CLOSE_NAME = 'PopoverClose';
const $7d632c09314cddaf$export$d6ac43ebaa40d53e = /*#__PURE__*/ $aJPOC$react.forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , ...closeProps } = props;
    const context = $7d632c09314cddaf$var$usePopoverContext($7d632c09314cddaf$var$CLOSE_NAME, __scopePopover);
    return /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({
        type: "button"
    }, closeProps, {
        ref: forwardedRef,
        onClick: $aJPOC$radixuiprimitive.composeEventHandlers(props.onClick, ()=>context.onOpenChange(false)
        )
    }));
});
/*#__PURE__*/ Object.assign($7d632c09314cddaf$export$d6ac43ebaa40d53e, {
    displayName: $7d632c09314cddaf$var$CLOSE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverArrow
 * -----------------------------------------------------------------------------------------------*/ const $7d632c09314cddaf$var$ARROW_NAME = 'PopoverArrow';
const $7d632c09314cddaf$export$3152841115e061b2 = /*#__PURE__*/ $aJPOC$react.forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , ...arrowProps } = props;
    const popperScope = $7d632c09314cddaf$var$usePopperScope(__scopePopover);
    return /*#__PURE__*/ $aJPOC$react.createElement($aJPOC$radixuireactpopper.Arrow, ($parcel$interopDefault($aJPOC$babelruntimehelpersextends))({}, popperScope, arrowProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($7d632c09314cddaf$export$3152841115e061b2, {
    displayName: $7d632c09314cddaf$var$ARROW_NAME
});
/* -----------------------------------------------------------------------------------------------*/ function $7d632c09314cddaf$var$getState(open) {
    return open ? 'open' : 'closed';
}
const $7d632c09314cddaf$export$be92b6f5f03c0fe9 = $7d632c09314cddaf$export$5b6b19405a83ff9d;
const $7d632c09314cddaf$export$b688253958b8dfe7 = $7d632c09314cddaf$export$96e5381f42521a79;
const $7d632c09314cddaf$export$41fb9f06171c75f4 = $7d632c09314cddaf$export$7dacb05d26466c3;
const $7d632c09314cddaf$export$602eac185826482c = $7d632c09314cddaf$export$dd679ffb4362d2d4;
const $7d632c09314cddaf$export$7c6e2c02157bb7d2 = $7d632c09314cddaf$export$d7e1f420b25549ff;
const $7d632c09314cddaf$export$f39c2d165cd861fe = $7d632c09314cddaf$export$d6ac43ebaa40d53e;
const $7d632c09314cddaf$export$21b07c8f274aebd5 = $7d632c09314cddaf$export$3152841115e061b2;




//# sourceMappingURL=index.js.map
