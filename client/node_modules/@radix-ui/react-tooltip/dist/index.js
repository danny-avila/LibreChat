var $iVrL9$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $iVrL9$react = require("react");
var $iVrL9$radixuiprimitive = require("@radix-ui/primitive");
var $iVrL9$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $iVrL9$radixuireactcontext = require("@radix-ui/react-context");
var $iVrL9$radixuireactdismissablelayer = require("@radix-ui/react-dismissable-layer");
var $iVrL9$radixuireactid = require("@radix-ui/react-id");
var $iVrL9$radixuireactpopper = require("@radix-ui/react-popper");
var $iVrL9$radixuireactportal = require("@radix-ui/react-portal");
var $iVrL9$radixuireactpresence = require("@radix-ui/react-presence");
var $iVrL9$radixuireactprimitive = require("@radix-ui/react-primitive");
var $iVrL9$radixuireactslot = require("@radix-ui/react-slot");
var $iVrL9$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $iVrL9$radixuireactvisuallyhidden = require("@radix-ui/react-visually-hidden");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createTooltipScope", () => $c34afbc43c90cc6f$export$1c540a2224f0d865);
$parcel$export(module.exports, "TooltipProvider", () => $c34afbc43c90cc6f$export$f78649fb9ca566b8);
$parcel$export(module.exports, "Tooltip", () => $c34afbc43c90cc6f$export$28c660c63b792dea);
$parcel$export(module.exports, "TooltipTrigger", () => $c34afbc43c90cc6f$export$8c610744efcf8a1d);
$parcel$export(module.exports, "TooltipPortal", () => $c34afbc43c90cc6f$export$7b36b8f925ab7497);
$parcel$export(module.exports, "TooltipContent", () => $c34afbc43c90cc6f$export$e9003e2be37ec060);
$parcel$export(module.exports, "TooltipArrow", () => $c34afbc43c90cc6f$export$c27ee0ad710f7559);
$parcel$export(module.exports, "Provider", () => $c34afbc43c90cc6f$export$2881499e37b75b9a);
$parcel$export(module.exports, "Root", () => $c34afbc43c90cc6f$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Trigger", () => $c34afbc43c90cc6f$export$41fb9f06171c75f4);
$parcel$export(module.exports, "Portal", () => $c34afbc43c90cc6f$export$602eac185826482c);
$parcel$export(module.exports, "Content", () => $c34afbc43c90cc6f$export$7c6e2c02157bb7d2);
$parcel$export(module.exports, "Arrow", () => $c34afbc43c90cc6f$export$21b07c8f274aebd5);















const [$c34afbc43c90cc6f$var$createTooltipContext, $c34afbc43c90cc6f$export$1c540a2224f0d865] = $iVrL9$radixuireactcontext.createContextScope('Tooltip', [
    $iVrL9$radixuireactpopper.createPopperScope
]);
const $c34afbc43c90cc6f$var$usePopperScope = $iVrL9$radixuireactpopper.createPopperScope();
/* -------------------------------------------------------------------------------------------------
 * TooltipProvider
 * -----------------------------------------------------------------------------------------------*/ const $c34afbc43c90cc6f$var$PROVIDER_NAME = 'TooltipProvider';
const $c34afbc43c90cc6f$var$DEFAULT_DELAY_DURATION = 700;
const $c34afbc43c90cc6f$var$TOOLTIP_OPEN = 'tooltip.open';
const [$c34afbc43c90cc6f$var$TooltipProviderContextProvider, $c34afbc43c90cc6f$var$useTooltipProviderContext] = $c34afbc43c90cc6f$var$createTooltipContext($c34afbc43c90cc6f$var$PROVIDER_NAME);
const $c34afbc43c90cc6f$export$f78649fb9ca566b8 = (props)=>{
    const { __scopeTooltip: __scopeTooltip , delayDuration: delayDuration = $c34afbc43c90cc6f$var$DEFAULT_DELAY_DURATION , skipDelayDuration: skipDelayDuration = 300 , disableHoverableContent: disableHoverableContent = false , children: children  } = props;
    const [isOpenDelayed, setIsOpenDelayed] = $iVrL9$react.useState(true);
    const isPointerInTransitRef = $iVrL9$react.useRef(false);
    const skipDelayTimerRef = $iVrL9$react.useRef(0);
    $iVrL9$react.useEffect(()=>{
        const skipDelayTimer = skipDelayTimerRef.current;
        return ()=>window.clearTimeout(skipDelayTimer)
        ;
    }, []);
    return /*#__PURE__*/ $iVrL9$react.createElement($c34afbc43c90cc6f$var$TooltipProviderContextProvider, {
        scope: __scopeTooltip,
        isOpenDelayed: isOpenDelayed,
        delayDuration: delayDuration,
        onOpen: $iVrL9$react.useCallback(()=>{
            window.clearTimeout(skipDelayTimerRef.current);
            setIsOpenDelayed(false);
        }, []),
        onClose: $iVrL9$react.useCallback(()=>{
            window.clearTimeout(skipDelayTimerRef.current);
            skipDelayTimerRef.current = window.setTimeout(()=>setIsOpenDelayed(true)
            , skipDelayDuration);
        }, [
            skipDelayDuration
        ]),
        isPointerInTransitRef: isPointerInTransitRef,
        onPointerInTransitChange: $iVrL9$react.useCallback((inTransit)=>{
            isPointerInTransitRef.current = inTransit;
        }, []),
        disableHoverableContent: disableHoverableContent
    }, children);
};
/*#__PURE__*/ Object.assign($c34afbc43c90cc6f$export$f78649fb9ca566b8, {
    displayName: $c34afbc43c90cc6f$var$PROVIDER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * Tooltip
 * -----------------------------------------------------------------------------------------------*/ const $c34afbc43c90cc6f$var$TOOLTIP_NAME = 'Tooltip';
const [$c34afbc43c90cc6f$var$TooltipContextProvider, $c34afbc43c90cc6f$var$useTooltipContext] = $c34afbc43c90cc6f$var$createTooltipContext($c34afbc43c90cc6f$var$TOOLTIP_NAME);
const $c34afbc43c90cc6f$export$28c660c63b792dea = (props)=>{
    const { __scopeTooltip: __scopeTooltip , children: children , open: openProp , defaultOpen: defaultOpen = false , onOpenChange: onOpenChange , disableHoverableContent: disableHoverableContentProp , delayDuration: delayDurationProp  } = props;
    const providerContext = $c34afbc43c90cc6f$var$useTooltipProviderContext($c34afbc43c90cc6f$var$TOOLTIP_NAME, props.__scopeTooltip);
    const popperScope = $c34afbc43c90cc6f$var$usePopperScope(__scopeTooltip);
    const [trigger, setTrigger] = $iVrL9$react.useState(null);
    const contentId = $iVrL9$radixuireactid.useId();
    const openTimerRef = $iVrL9$react.useRef(0);
    const disableHoverableContent = disableHoverableContentProp !== null && disableHoverableContentProp !== void 0 ? disableHoverableContentProp : providerContext.disableHoverableContent;
    const delayDuration = delayDurationProp !== null && delayDurationProp !== void 0 ? delayDurationProp : providerContext.delayDuration;
    const wasOpenDelayedRef = $iVrL9$react.useRef(false);
    const [open1 = false, setOpen] = $iVrL9$radixuireactusecontrollablestate.useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: (open)=>{
            if (open) {
                providerContext.onOpen(); // as `onChange` is called within a lifecycle method we
                // avoid dispatching via `dispatchDiscreteCustomEvent`.
                document.dispatchEvent(new CustomEvent($c34afbc43c90cc6f$var$TOOLTIP_OPEN));
            } else providerContext.onClose();
            onOpenChange === null || onOpenChange === void 0 || onOpenChange(open);
        }
    });
    const stateAttribute = $iVrL9$react.useMemo(()=>{
        return open1 ? wasOpenDelayedRef.current ? 'delayed-open' : 'instant-open' : 'closed';
    }, [
        open1
    ]);
    const handleOpen = $iVrL9$react.useCallback(()=>{
        window.clearTimeout(openTimerRef.current);
        wasOpenDelayedRef.current = false;
        setOpen(true);
    }, [
        setOpen
    ]);
    const handleClose = $iVrL9$react.useCallback(()=>{
        window.clearTimeout(openTimerRef.current);
        setOpen(false);
    }, [
        setOpen
    ]);
    const handleDelayedOpen = $iVrL9$react.useCallback(()=>{
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = window.setTimeout(()=>{
            wasOpenDelayedRef.current = true;
            setOpen(true);
        }, delayDuration);
    }, [
        delayDuration,
        setOpen
    ]);
    $iVrL9$react.useEffect(()=>{
        return ()=>window.clearTimeout(openTimerRef.current)
        ;
    }, []);
    return /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactpopper.Root, popperScope, /*#__PURE__*/ $iVrL9$react.createElement($c34afbc43c90cc6f$var$TooltipContextProvider, {
        scope: __scopeTooltip,
        contentId: contentId,
        open: open1,
        stateAttribute: stateAttribute,
        trigger: trigger,
        onTriggerChange: setTrigger,
        onTriggerEnter: $iVrL9$react.useCallback(()=>{
            if (providerContext.isOpenDelayed) handleDelayedOpen();
            else handleOpen();
        }, [
            providerContext.isOpenDelayed,
            handleDelayedOpen,
            handleOpen
        ]),
        onTriggerLeave: $iVrL9$react.useCallback(()=>{
            if (disableHoverableContent) handleClose();
            else // Clear the timer in case the pointer leaves the trigger before the tooltip is opened.
            window.clearTimeout(openTimerRef.current);
        }, [
            handleClose,
            disableHoverableContent
        ]),
        onOpen: handleOpen,
        onClose: handleClose,
        disableHoverableContent: disableHoverableContent
    }, children));
};
/*#__PURE__*/ Object.assign($c34afbc43c90cc6f$export$28c660c63b792dea, {
    displayName: $c34afbc43c90cc6f$var$TOOLTIP_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TooltipTrigger
 * -----------------------------------------------------------------------------------------------*/ const $c34afbc43c90cc6f$var$TRIGGER_NAME = 'TooltipTrigger';
const $c34afbc43c90cc6f$export$8c610744efcf8a1d = /*#__PURE__*/ $iVrL9$react.forwardRef((props, forwardedRef)=>{
    const { __scopeTooltip: __scopeTooltip , ...triggerProps } = props;
    const context = $c34afbc43c90cc6f$var$useTooltipContext($c34afbc43c90cc6f$var$TRIGGER_NAME, __scopeTooltip);
    const providerContext = $c34afbc43c90cc6f$var$useTooltipProviderContext($c34afbc43c90cc6f$var$TRIGGER_NAME, __scopeTooltip);
    const popperScope = $c34afbc43c90cc6f$var$usePopperScope(__scopeTooltip);
    const ref = $iVrL9$react.useRef(null);
    const composedRefs = $iVrL9$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref, context.onTriggerChange);
    const isPointerDownRef = $iVrL9$react.useRef(false);
    const hasPointerMoveOpenedRef = $iVrL9$react.useRef(false);
    const handlePointerUp = $iVrL9$react.useCallback(()=>isPointerDownRef.current = false
    , []);
    $iVrL9$react.useEffect(()=>{
        return ()=>document.removeEventListener('pointerup', handlePointerUp)
        ;
    }, [
        handlePointerUp
    ]);
    return /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactpopper.Anchor, ($parcel$interopDefault($iVrL9$babelruntimehelpersextends))({
        asChild: true
    }, popperScope), /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($iVrL9$babelruntimehelpersextends))({
        // We purposefully avoid adding `type=button` here because tooltip triggers are also
        // commonly anchors and the anchor `type` attribute signifies MIME type.
        "aria-describedby": context.open ? context.contentId : undefined,
        "data-state": context.stateAttribute
    }, triggerProps, {
        ref: composedRefs,
        onPointerMove: $iVrL9$radixuiprimitive.composeEventHandlers(props.onPointerMove, (event)=>{
            if (event.pointerType === 'touch') return;
            if (!hasPointerMoveOpenedRef.current && !providerContext.isPointerInTransitRef.current) {
                context.onTriggerEnter();
                hasPointerMoveOpenedRef.current = true;
            }
        }),
        onPointerLeave: $iVrL9$radixuiprimitive.composeEventHandlers(props.onPointerLeave, ()=>{
            context.onTriggerLeave();
            hasPointerMoveOpenedRef.current = false;
        }),
        onPointerDown: $iVrL9$radixuiprimitive.composeEventHandlers(props.onPointerDown, ()=>{
            isPointerDownRef.current = true;
            document.addEventListener('pointerup', handlePointerUp, {
                once: true
            });
        }),
        onFocus: $iVrL9$radixuiprimitive.composeEventHandlers(props.onFocus, ()=>{
            if (!isPointerDownRef.current) context.onOpen();
        }),
        onBlur: $iVrL9$radixuiprimitive.composeEventHandlers(props.onBlur, context.onClose),
        onClick: $iVrL9$radixuiprimitive.composeEventHandlers(props.onClick, context.onClose)
    })));
});
/*#__PURE__*/ Object.assign($c34afbc43c90cc6f$export$8c610744efcf8a1d, {
    displayName: $c34afbc43c90cc6f$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TooltipPortal
 * -----------------------------------------------------------------------------------------------*/ const $c34afbc43c90cc6f$var$PORTAL_NAME = 'TooltipPortal';
const [$c34afbc43c90cc6f$var$PortalProvider, $c34afbc43c90cc6f$var$usePortalContext] = $c34afbc43c90cc6f$var$createTooltipContext($c34afbc43c90cc6f$var$PORTAL_NAME, {
    forceMount: undefined
});
const $c34afbc43c90cc6f$export$7b36b8f925ab7497 = (props)=>{
    const { __scopeTooltip: __scopeTooltip , forceMount: forceMount , children: children , container: container  } = props;
    const context = $c34afbc43c90cc6f$var$useTooltipContext($c34afbc43c90cc6f$var$PORTAL_NAME, __scopeTooltip);
    return /*#__PURE__*/ $iVrL9$react.createElement($c34afbc43c90cc6f$var$PortalProvider, {
        scope: __scopeTooltip,
        forceMount: forceMount
    }, /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactportal.Portal, {
        asChild: true,
        container: container
    }, children)));
};
/*#__PURE__*/ Object.assign($c34afbc43c90cc6f$export$7b36b8f925ab7497, {
    displayName: $c34afbc43c90cc6f$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TooltipContent
 * -----------------------------------------------------------------------------------------------*/ const $c34afbc43c90cc6f$var$CONTENT_NAME = 'TooltipContent';
const $c34afbc43c90cc6f$export$e9003e2be37ec060 = /*#__PURE__*/ $iVrL9$react.forwardRef((props, forwardedRef)=>{
    const portalContext = $c34afbc43c90cc6f$var$usePortalContext($c34afbc43c90cc6f$var$CONTENT_NAME, props.__scopeTooltip);
    const { forceMount: forceMount = portalContext.forceMount , side: side = 'top' , ...contentProps } = props;
    const context = $c34afbc43c90cc6f$var$useTooltipContext($c34afbc43c90cc6f$var$CONTENT_NAME, props.__scopeTooltip);
    return /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, context.disableHoverableContent ? /*#__PURE__*/ $iVrL9$react.createElement($c34afbc43c90cc6f$var$TooltipContentImpl, ($parcel$interopDefault($iVrL9$babelruntimehelpersextends))({
        side: side
    }, contentProps, {
        ref: forwardedRef
    })) : /*#__PURE__*/ $iVrL9$react.createElement($c34afbc43c90cc6f$var$TooltipContentHoverable, ($parcel$interopDefault($iVrL9$babelruntimehelpersextends))({
        side: side
    }, contentProps, {
        ref: forwardedRef
    })));
});
const $c34afbc43c90cc6f$var$TooltipContentHoverable = /*#__PURE__*/ $iVrL9$react.forwardRef((props, forwardedRef)=>{
    const context = $c34afbc43c90cc6f$var$useTooltipContext($c34afbc43c90cc6f$var$CONTENT_NAME, props.__scopeTooltip);
    const providerContext = $c34afbc43c90cc6f$var$useTooltipProviderContext($c34afbc43c90cc6f$var$CONTENT_NAME, props.__scopeTooltip);
    const ref = $iVrL9$react.useRef(null);
    const composedRefs = $iVrL9$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref);
    const [pointerGraceArea, setPointerGraceArea] = $iVrL9$react.useState(null);
    const { trigger: trigger , onClose: onClose  } = context;
    const content = ref.current;
    const { onPointerInTransitChange: onPointerInTransitChange  } = providerContext;
    const handleRemoveGraceArea = $iVrL9$react.useCallback(()=>{
        setPointerGraceArea(null);
        onPointerInTransitChange(false);
    }, [
        onPointerInTransitChange
    ]);
    const handleCreateGraceArea = $iVrL9$react.useCallback((event, hoverTarget)=>{
        const currentTarget = event.currentTarget;
        const exitPoint = {
            x: event.clientX,
            y: event.clientY
        };
        const exitSide = $c34afbc43c90cc6f$var$getExitSideFromRect(exitPoint, currentTarget.getBoundingClientRect());
        const paddedExitPoints = $c34afbc43c90cc6f$var$getPaddedExitPoints(exitPoint, exitSide);
        const hoverTargetPoints = $c34afbc43c90cc6f$var$getPointsFromRect(hoverTarget.getBoundingClientRect());
        const graceArea = $c34afbc43c90cc6f$var$getHull([
            ...paddedExitPoints,
            ...hoverTargetPoints
        ]);
        setPointerGraceArea(graceArea);
        onPointerInTransitChange(true);
    }, [
        onPointerInTransitChange
    ]);
    $iVrL9$react.useEffect(()=>{
        return ()=>handleRemoveGraceArea()
        ;
    }, [
        handleRemoveGraceArea
    ]);
    $iVrL9$react.useEffect(()=>{
        if (trigger && content) {
            const handleTriggerLeave = (event)=>handleCreateGraceArea(event, content)
            ;
            const handleContentLeave = (event)=>handleCreateGraceArea(event, trigger)
            ;
            trigger.addEventListener('pointerleave', handleTriggerLeave);
            content.addEventListener('pointerleave', handleContentLeave);
            return ()=>{
                trigger.removeEventListener('pointerleave', handleTriggerLeave);
                content.removeEventListener('pointerleave', handleContentLeave);
            };
        }
    }, [
        trigger,
        content,
        handleCreateGraceArea,
        handleRemoveGraceArea
    ]);
    $iVrL9$react.useEffect(()=>{
        if (pointerGraceArea) {
            const handleTrackPointerGrace = (event)=>{
                const target = event.target;
                const pointerPosition = {
                    x: event.clientX,
                    y: event.clientY
                };
                const hasEnteredTarget = (trigger === null || trigger === void 0 ? void 0 : trigger.contains(target)) || (content === null || content === void 0 ? void 0 : content.contains(target));
                const isPointerOutsideGraceArea = !$c34afbc43c90cc6f$var$isPointInPolygon(pointerPosition, pointerGraceArea);
                if (hasEnteredTarget) handleRemoveGraceArea();
                else if (isPointerOutsideGraceArea) {
                    handleRemoveGraceArea();
                    onClose();
                }
            };
            document.addEventListener('pointermove', handleTrackPointerGrace);
            return ()=>document.removeEventListener('pointermove', handleTrackPointerGrace)
            ;
        }
    }, [
        trigger,
        content,
        pointerGraceArea,
        onClose,
        handleRemoveGraceArea
    ]);
    return /*#__PURE__*/ $iVrL9$react.createElement($c34afbc43c90cc6f$var$TooltipContentImpl, ($parcel$interopDefault($iVrL9$babelruntimehelpersextends))({}, props, {
        ref: composedRefs
    }));
});
const [$c34afbc43c90cc6f$var$VisuallyHiddenContentContextProvider, $c34afbc43c90cc6f$var$useVisuallyHiddenContentContext] = $c34afbc43c90cc6f$var$createTooltipContext($c34afbc43c90cc6f$var$TOOLTIP_NAME, {
    isInside: false
});
const $c34afbc43c90cc6f$var$TooltipContentImpl = /*#__PURE__*/ $iVrL9$react.forwardRef((props, forwardedRef)=>{
    const { __scopeTooltip: __scopeTooltip , children: children , 'aria-label': ariaLabel , onEscapeKeyDown: onEscapeKeyDown , onPointerDownOutside: onPointerDownOutside , ...contentProps } = props;
    const context = $c34afbc43c90cc6f$var$useTooltipContext($c34afbc43c90cc6f$var$CONTENT_NAME, __scopeTooltip);
    const popperScope = $c34afbc43c90cc6f$var$usePopperScope(__scopeTooltip);
    const { onClose: onClose  } = context; // Close this tooltip if another one opens
    $iVrL9$react.useEffect(()=>{
        document.addEventListener($c34afbc43c90cc6f$var$TOOLTIP_OPEN, onClose);
        return ()=>document.removeEventListener($c34afbc43c90cc6f$var$TOOLTIP_OPEN, onClose)
        ;
    }, [
        onClose
    ]); // Close the tooltip if the trigger is scrolled
    $iVrL9$react.useEffect(()=>{
        if (context.trigger) {
            const handleScroll = (event)=>{
                const target = event.target;
                if (target !== null && target !== void 0 && target.contains(context.trigger)) onClose();
            };
            window.addEventListener('scroll', handleScroll, {
                capture: true
            });
            return ()=>window.removeEventListener('scroll', handleScroll, {
                    capture: true
                })
            ;
        }
    }, [
        context.trigger,
        onClose
    ]);
    return /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactdismissablelayer.DismissableLayer, {
        asChild: true,
        disableOutsidePointerEvents: false,
        onEscapeKeyDown: onEscapeKeyDown,
        onPointerDownOutside: onPointerDownOutside,
        onFocusOutside: (event)=>event.preventDefault()
        ,
        onDismiss: onClose
    }, /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactpopper.Content, ($parcel$interopDefault($iVrL9$babelruntimehelpersextends))({
        "data-state": context.stateAttribute
    }, popperScope, contentProps, {
        ref: forwardedRef,
        style: {
            ...contentProps.style,
            '--radix-tooltip-content-transform-origin': 'var(--radix-popper-transform-origin)',
            '--radix-tooltip-content-available-width': 'var(--radix-popper-available-width)',
            '--radix-tooltip-content-available-height': 'var(--radix-popper-available-height)',
            '--radix-tooltip-trigger-width': 'var(--radix-popper-anchor-width)',
            '--radix-tooltip-trigger-height': 'var(--radix-popper-anchor-height)'
        }
    }), /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactslot.Slottable, null, children), /*#__PURE__*/ $iVrL9$react.createElement($c34afbc43c90cc6f$var$VisuallyHiddenContentContextProvider, {
        scope: __scopeTooltip,
        isInside: true
    }, /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactvisuallyhidden.Root, {
        id: context.contentId,
        role: "tooltip"
    }, ariaLabel || children))));
});
/*#__PURE__*/ Object.assign($c34afbc43c90cc6f$export$e9003e2be37ec060, {
    displayName: $c34afbc43c90cc6f$var$CONTENT_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TooltipArrow
 * -----------------------------------------------------------------------------------------------*/ const $c34afbc43c90cc6f$var$ARROW_NAME = 'TooltipArrow';
const $c34afbc43c90cc6f$export$c27ee0ad710f7559 = /*#__PURE__*/ $iVrL9$react.forwardRef((props, forwardedRef)=>{
    const { __scopeTooltip: __scopeTooltip , ...arrowProps } = props;
    const popperScope = $c34afbc43c90cc6f$var$usePopperScope(__scopeTooltip);
    const visuallyHiddenContentContext = $c34afbc43c90cc6f$var$useVisuallyHiddenContentContext($c34afbc43c90cc6f$var$ARROW_NAME, __scopeTooltip); // if the arrow is inside the `VisuallyHidden`, we don't want to render it all to
    // prevent issues in positioning the arrow due to the duplicate
    return visuallyHiddenContentContext.isInside ? null : /*#__PURE__*/ $iVrL9$react.createElement($iVrL9$radixuireactpopper.Arrow, ($parcel$interopDefault($iVrL9$babelruntimehelpersextends))({}, popperScope, arrowProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($c34afbc43c90cc6f$export$c27ee0ad710f7559, {
    displayName: $c34afbc43c90cc6f$var$ARROW_NAME
});
/* -----------------------------------------------------------------------------------------------*/ function $c34afbc43c90cc6f$var$getExitSideFromRect(point, rect) {
    const top = Math.abs(rect.top - point.y);
    const bottom = Math.abs(rect.bottom - point.y);
    const right = Math.abs(rect.right - point.x);
    const left = Math.abs(rect.left - point.x);
    switch(Math.min(top, bottom, right, left)){
        case left:
            return 'left';
        case right:
            return 'right';
        case top:
            return 'top';
        case bottom:
            return 'bottom';
        default:
            throw new Error('unreachable');
    }
}
function $c34afbc43c90cc6f$var$getPaddedExitPoints(exitPoint, exitSide, padding = 5) {
    const paddedExitPoints = [];
    switch(exitSide){
        case 'top':
            paddedExitPoints.push({
                x: exitPoint.x - padding,
                y: exitPoint.y + padding
            }, {
                x: exitPoint.x + padding,
                y: exitPoint.y + padding
            });
            break;
        case 'bottom':
            paddedExitPoints.push({
                x: exitPoint.x - padding,
                y: exitPoint.y - padding
            }, {
                x: exitPoint.x + padding,
                y: exitPoint.y - padding
            });
            break;
        case 'left':
            paddedExitPoints.push({
                x: exitPoint.x + padding,
                y: exitPoint.y - padding
            }, {
                x: exitPoint.x + padding,
                y: exitPoint.y + padding
            });
            break;
        case 'right':
            paddedExitPoints.push({
                x: exitPoint.x - padding,
                y: exitPoint.y - padding
            }, {
                x: exitPoint.x - padding,
                y: exitPoint.y + padding
            });
            break;
    }
    return paddedExitPoints;
}
function $c34afbc43c90cc6f$var$getPointsFromRect(rect) {
    const { top: top , right: right , bottom: bottom , left: left  } = rect;
    return [
        {
            x: left,
            y: top
        },
        {
            x: right,
            y: top
        },
        {
            x: right,
            y: bottom
        },
        {
            x: left,
            y: bottom
        }
    ];
} // Determine if a point is inside of a polygon.
// Based on https://github.com/substack/point-in-polygon
function $c34afbc43c90cc6f$var$isPointInPolygon(point, polygon) {
    const { x: x , y: y  } = point;
    let inside = false;
    for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++){
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y; // prettier-ignore
        const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
} // Returns a new array of points representing the convex hull of the given set of points.
// https://www.nayuki.io/page/convex-hull-algorithm
function $c34afbc43c90cc6f$var$getHull(points) {
    const newPoints = points.slice();
    newPoints.sort((a, b)=>{
        if (a.x < b.x) return -1;
        else if (a.x > b.x) return 1;
        else if (a.y < b.y) return -1;
        else if (a.y > b.y) return 1;
        else return 0;
    });
    return $c34afbc43c90cc6f$var$getHullPresorted(newPoints);
} // Returns the convex hull, assuming that each points[i] <= points[i + 1]. Runs in O(n) time.
function $c34afbc43c90cc6f$var$getHullPresorted(points) {
    if (points.length <= 1) return points.slice();
    const upperHull = [];
    for(let i = 0; i < points.length; i++){
        const p = points[i];
        while(upperHull.length >= 2){
            const q = upperHull[upperHull.length - 1];
            const r = upperHull[upperHull.length - 2];
            if ((q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x)) upperHull.pop();
            else break;
        }
        upperHull.push(p);
    }
    upperHull.pop();
    const lowerHull = [];
    for(let i1 = points.length - 1; i1 >= 0; i1--){
        const p = points[i1];
        while(lowerHull.length >= 2){
            const q = lowerHull[lowerHull.length - 1];
            const r = lowerHull[lowerHull.length - 2];
            if ((q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x)) lowerHull.pop();
            else break;
        }
        lowerHull.push(p);
    }
    lowerHull.pop();
    if (upperHull.length === 1 && lowerHull.length === 1 && upperHull[0].x === lowerHull[0].x && upperHull[0].y === lowerHull[0].y) return upperHull;
    else return upperHull.concat(lowerHull);
}
const $c34afbc43c90cc6f$export$2881499e37b75b9a = $c34afbc43c90cc6f$export$f78649fb9ca566b8;
const $c34afbc43c90cc6f$export$be92b6f5f03c0fe9 = $c34afbc43c90cc6f$export$28c660c63b792dea;
const $c34afbc43c90cc6f$export$41fb9f06171c75f4 = $c34afbc43c90cc6f$export$8c610744efcf8a1d;
const $c34afbc43c90cc6f$export$602eac185826482c = $c34afbc43c90cc6f$export$7b36b8f925ab7497;
const $c34afbc43c90cc6f$export$7c6e2c02157bb7d2 = $c34afbc43c90cc6f$export$e9003e2be37ec060;
const $c34afbc43c90cc6f$export$21b07c8f274aebd5 = $c34afbc43c90cc6f$export$c27ee0ad710f7559;




//# sourceMappingURL=index.js.map
