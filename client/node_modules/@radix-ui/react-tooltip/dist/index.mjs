import $8wepK$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {useState as $8wepK$useState, useRef as $8wepK$useRef, useEffect as $8wepK$useEffect, createElement as $8wepK$createElement, useCallback as $8wepK$useCallback, useMemo as $8wepK$useMemo, forwardRef as $8wepK$forwardRef} from "react";
import {composeEventHandlers as $8wepK$composeEventHandlers} from "@radix-ui/primitive";
import {useComposedRefs as $8wepK$useComposedRefs} from "@radix-ui/react-compose-refs";
import {createContextScope as $8wepK$createContextScope} from "@radix-ui/react-context";
import {DismissableLayer as $8wepK$DismissableLayer} from "@radix-ui/react-dismissable-layer";
import {useId as $8wepK$useId} from "@radix-ui/react-id";
import {createPopperScope as $8wepK$createPopperScope, Root as $8wepK$Root, Anchor as $8wepK$Anchor, Content as $8wepK$Content, Arrow as $8wepK$Arrow} from "@radix-ui/react-popper";
import {Portal as $8wepK$Portal} from "@radix-ui/react-portal";
import {Presence as $8wepK$Presence} from "@radix-ui/react-presence";
import {Primitive as $8wepK$Primitive} from "@radix-ui/react-primitive";
import {Slottable as $8wepK$Slottable} from "@radix-ui/react-slot";
import {useControllableState as $8wepK$useControllableState} from "@radix-ui/react-use-controllable-state";
import {Root as $8wepK$Root1} from "@radix-ui/react-visually-hidden";
















const [$a093c7e1ec25a057$var$createTooltipContext, $a093c7e1ec25a057$export$1c540a2224f0d865] = $8wepK$createContextScope('Tooltip', [
    $8wepK$createPopperScope
]);
const $a093c7e1ec25a057$var$usePopperScope = $8wepK$createPopperScope();
/* -------------------------------------------------------------------------------------------------
 * TooltipProvider
 * -----------------------------------------------------------------------------------------------*/ const $a093c7e1ec25a057$var$PROVIDER_NAME = 'TooltipProvider';
const $a093c7e1ec25a057$var$DEFAULT_DELAY_DURATION = 700;
const $a093c7e1ec25a057$var$TOOLTIP_OPEN = 'tooltip.open';
const [$a093c7e1ec25a057$var$TooltipProviderContextProvider, $a093c7e1ec25a057$var$useTooltipProviderContext] = $a093c7e1ec25a057$var$createTooltipContext($a093c7e1ec25a057$var$PROVIDER_NAME);
const $a093c7e1ec25a057$export$f78649fb9ca566b8 = (props)=>{
    const { __scopeTooltip: __scopeTooltip , delayDuration: delayDuration = $a093c7e1ec25a057$var$DEFAULT_DELAY_DURATION , skipDelayDuration: skipDelayDuration = 300 , disableHoverableContent: disableHoverableContent = false , children: children  } = props;
    const [isOpenDelayed, setIsOpenDelayed] = $8wepK$useState(true);
    const isPointerInTransitRef = $8wepK$useRef(false);
    const skipDelayTimerRef = $8wepK$useRef(0);
    $8wepK$useEffect(()=>{
        const skipDelayTimer = skipDelayTimerRef.current;
        return ()=>window.clearTimeout(skipDelayTimer)
        ;
    }, []);
    return /*#__PURE__*/ $8wepK$createElement($a093c7e1ec25a057$var$TooltipProviderContextProvider, {
        scope: __scopeTooltip,
        isOpenDelayed: isOpenDelayed,
        delayDuration: delayDuration,
        onOpen: $8wepK$useCallback(()=>{
            window.clearTimeout(skipDelayTimerRef.current);
            setIsOpenDelayed(false);
        }, []),
        onClose: $8wepK$useCallback(()=>{
            window.clearTimeout(skipDelayTimerRef.current);
            skipDelayTimerRef.current = window.setTimeout(()=>setIsOpenDelayed(true)
            , skipDelayDuration);
        }, [
            skipDelayDuration
        ]),
        isPointerInTransitRef: isPointerInTransitRef,
        onPointerInTransitChange: $8wepK$useCallback((inTransit)=>{
            isPointerInTransitRef.current = inTransit;
        }, []),
        disableHoverableContent: disableHoverableContent
    }, children);
};
/*#__PURE__*/ Object.assign($a093c7e1ec25a057$export$f78649fb9ca566b8, {
    displayName: $a093c7e1ec25a057$var$PROVIDER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * Tooltip
 * -----------------------------------------------------------------------------------------------*/ const $a093c7e1ec25a057$var$TOOLTIP_NAME = 'Tooltip';
const [$a093c7e1ec25a057$var$TooltipContextProvider, $a093c7e1ec25a057$var$useTooltipContext] = $a093c7e1ec25a057$var$createTooltipContext($a093c7e1ec25a057$var$TOOLTIP_NAME);
const $a093c7e1ec25a057$export$28c660c63b792dea = (props)=>{
    const { __scopeTooltip: __scopeTooltip , children: children , open: openProp , defaultOpen: defaultOpen = false , onOpenChange: onOpenChange , disableHoverableContent: disableHoverableContentProp , delayDuration: delayDurationProp  } = props;
    const providerContext = $a093c7e1ec25a057$var$useTooltipProviderContext($a093c7e1ec25a057$var$TOOLTIP_NAME, props.__scopeTooltip);
    const popperScope = $a093c7e1ec25a057$var$usePopperScope(__scopeTooltip);
    const [trigger, setTrigger] = $8wepK$useState(null);
    const contentId = $8wepK$useId();
    const openTimerRef = $8wepK$useRef(0);
    const disableHoverableContent = disableHoverableContentProp !== null && disableHoverableContentProp !== void 0 ? disableHoverableContentProp : providerContext.disableHoverableContent;
    const delayDuration = delayDurationProp !== null && delayDurationProp !== void 0 ? delayDurationProp : providerContext.delayDuration;
    const wasOpenDelayedRef = $8wepK$useRef(false);
    const [open1 = false, setOpen] = $8wepK$useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: (open)=>{
            if (open) {
                providerContext.onOpen(); // as `onChange` is called within a lifecycle method we
                // avoid dispatching via `dispatchDiscreteCustomEvent`.
                document.dispatchEvent(new CustomEvent($a093c7e1ec25a057$var$TOOLTIP_OPEN));
            } else providerContext.onClose();
            onOpenChange === null || onOpenChange === void 0 || onOpenChange(open);
        }
    });
    const stateAttribute = $8wepK$useMemo(()=>{
        return open1 ? wasOpenDelayedRef.current ? 'delayed-open' : 'instant-open' : 'closed';
    }, [
        open1
    ]);
    const handleOpen = $8wepK$useCallback(()=>{
        window.clearTimeout(openTimerRef.current);
        wasOpenDelayedRef.current = false;
        setOpen(true);
    }, [
        setOpen
    ]);
    const handleClose = $8wepK$useCallback(()=>{
        window.clearTimeout(openTimerRef.current);
        setOpen(false);
    }, [
        setOpen
    ]);
    const handleDelayedOpen = $8wepK$useCallback(()=>{
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = window.setTimeout(()=>{
            wasOpenDelayedRef.current = true;
            setOpen(true);
        }, delayDuration);
    }, [
        delayDuration,
        setOpen
    ]);
    $8wepK$useEffect(()=>{
        return ()=>window.clearTimeout(openTimerRef.current)
        ;
    }, []);
    return /*#__PURE__*/ $8wepK$createElement($8wepK$Root, popperScope, /*#__PURE__*/ $8wepK$createElement($a093c7e1ec25a057$var$TooltipContextProvider, {
        scope: __scopeTooltip,
        contentId: contentId,
        open: open1,
        stateAttribute: stateAttribute,
        trigger: trigger,
        onTriggerChange: setTrigger,
        onTriggerEnter: $8wepK$useCallback(()=>{
            if (providerContext.isOpenDelayed) handleDelayedOpen();
            else handleOpen();
        }, [
            providerContext.isOpenDelayed,
            handleDelayedOpen,
            handleOpen
        ]),
        onTriggerLeave: $8wepK$useCallback(()=>{
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
/*#__PURE__*/ Object.assign($a093c7e1ec25a057$export$28c660c63b792dea, {
    displayName: $a093c7e1ec25a057$var$TOOLTIP_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TooltipTrigger
 * -----------------------------------------------------------------------------------------------*/ const $a093c7e1ec25a057$var$TRIGGER_NAME = 'TooltipTrigger';
const $a093c7e1ec25a057$export$8c610744efcf8a1d = /*#__PURE__*/ $8wepK$forwardRef((props, forwardedRef)=>{
    const { __scopeTooltip: __scopeTooltip , ...triggerProps } = props;
    const context = $a093c7e1ec25a057$var$useTooltipContext($a093c7e1ec25a057$var$TRIGGER_NAME, __scopeTooltip);
    const providerContext = $a093c7e1ec25a057$var$useTooltipProviderContext($a093c7e1ec25a057$var$TRIGGER_NAME, __scopeTooltip);
    const popperScope = $a093c7e1ec25a057$var$usePopperScope(__scopeTooltip);
    const ref = $8wepK$useRef(null);
    const composedRefs = $8wepK$useComposedRefs(forwardedRef, ref, context.onTriggerChange);
    const isPointerDownRef = $8wepK$useRef(false);
    const hasPointerMoveOpenedRef = $8wepK$useRef(false);
    const handlePointerUp = $8wepK$useCallback(()=>isPointerDownRef.current = false
    , []);
    $8wepK$useEffect(()=>{
        return ()=>document.removeEventListener('pointerup', handlePointerUp)
        ;
    }, [
        handlePointerUp
    ]);
    return /*#__PURE__*/ $8wepK$createElement($8wepK$Anchor, $8wepK$babelruntimehelpersesmextends({
        asChild: true
    }, popperScope), /*#__PURE__*/ $8wepK$createElement($8wepK$Primitive.button, $8wepK$babelruntimehelpersesmextends({
        // We purposefully avoid adding `type=button` here because tooltip triggers are also
        // commonly anchors and the anchor `type` attribute signifies MIME type.
        "aria-describedby": context.open ? context.contentId : undefined,
        "data-state": context.stateAttribute
    }, triggerProps, {
        ref: composedRefs,
        onPointerMove: $8wepK$composeEventHandlers(props.onPointerMove, (event)=>{
            if (event.pointerType === 'touch') return;
            if (!hasPointerMoveOpenedRef.current && !providerContext.isPointerInTransitRef.current) {
                context.onTriggerEnter();
                hasPointerMoveOpenedRef.current = true;
            }
        }),
        onPointerLeave: $8wepK$composeEventHandlers(props.onPointerLeave, ()=>{
            context.onTriggerLeave();
            hasPointerMoveOpenedRef.current = false;
        }),
        onPointerDown: $8wepK$composeEventHandlers(props.onPointerDown, ()=>{
            isPointerDownRef.current = true;
            document.addEventListener('pointerup', handlePointerUp, {
                once: true
            });
        }),
        onFocus: $8wepK$composeEventHandlers(props.onFocus, ()=>{
            if (!isPointerDownRef.current) context.onOpen();
        }),
        onBlur: $8wepK$composeEventHandlers(props.onBlur, context.onClose),
        onClick: $8wepK$composeEventHandlers(props.onClick, context.onClose)
    })));
});
/*#__PURE__*/ Object.assign($a093c7e1ec25a057$export$8c610744efcf8a1d, {
    displayName: $a093c7e1ec25a057$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TooltipPortal
 * -----------------------------------------------------------------------------------------------*/ const $a093c7e1ec25a057$var$PORTAL_NAME = 'TooltipPortal';
const [$a093c7e1ec25a057$var$PortalProvider, $a093c7e1ec25a057$var$usePortalContext] = $a093c7e1ec25a057$var$createTooltipContext($a093c7e1ec25a057$var$PORTAL_NAME, {
    forceMount: undefined
});
const $a093c7e1ec25a057$export$7b36b8f925ab7497 = (props)=>{
    const { __scopeTooltip: __scopeTooltip , forceMount: forceMount , children: children , container: container  } = props;
    const context = $a093c7e1ec25a057$var$useTooltipContext($a093c7e1ec25a057$var$PORTAL_NAME, __scopeTooltip);
    return /*#__PURE__*/ $8wepK$createElement($a093c7e1ec25a057$var$PortalProvider, {
        scope: __scopeTooltip,
        forceMount: forceMount
    }, /*#__PURE__*/ $8wepK$createElement($8wepK$Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $8wepK$createElement($8wepK$Portal, {
        asChild: true,
        container: container
    }, children)));
};
/*#__PURE__*/ Object.assign($a093c7e1ec25a057$export$7b36b8f925ab7497, {
    displayName: $a093c7e1ec25a057$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TooltipContent
 * -----------------------------------------------------------------------------------------------*/ const $a093c7e1ec25a057$var$CONTENT_NAME = 'TooltipContent';
const $a093c7e1ec25a057$export$e9003e2be37ec060 = /*#__PURE__*/ $8wepK$forwardRef((props, forwardedRef)=>{
    const portalContext = $a093c7e1ec25a057$var$usePortalContext($a093c7e1ec25a057$var$CONTENT_NAME, props.__scopeTooltip);
    const { forceMount: forceMount = portalContext.forceMount , side: side = 'top' , ...contentProps } = props;
    const context = $a093c7e1ec25a057$var$useTooltipContext($a093c7e1ec25a057$var$CONTENT_NAME, props.__scopeTooltip);
    return /*#__PURE__*/ $8wepK$createElement($8wepK$Presence, {
        present: forceMount || context.open
    }, context.disableHoverableContent ? /*#__PURE__*/ $8wepK$createElement($a093c7e1ec25a057$var$TooltipContentImpl, $8wepK$babelruntimehelpersesmextends({
        side: side
    }, contentProps, {
        ref: forwardedRef
    })) : /*#__PURE__*/ $8wepK$createElement($a093c7e1ec25a057$var$TooltipContentHoverable, $8wepK$babelruntimehelpersesmextends({
        side: side
    }, contentProps, {
        ref: forwardedRef
    })));
});
const $a093c7e1ec25a057$var$TooltipContentHoverable = /*#__PURE__*/ $8wepK$forwardRef((props, forwardedRef)=>{
    const context = $a093c7e1ec25a057$var$useTooltipContext($a093c7e1ec25a057$var$CONTENT_NAME, props.__scopeTooltip);
    const providerContext = $a093c7e1ec25a057$var$useTooltipProviderContext($a093c7e1ec25a057$var$CONTENT_NAME, props.__scopeTooltip);
    const ref = $8wepK$useRef(null);
    const composedRefs = $8wepK$useComposedRefs(forwardedRef, ref);
    const [pointerGraceArea, setPointerGraceArea] = $8wepK$useState(null);
    const { trigger: trigger , onClose: onClose  } = context;
    const content = ref.current;
    const { onPointerInTransitChange: onPointerInTransitChange  } = providerContext;
    const handleRemoveGraceArea = $8wepK$useCallback(()=>{
        setPointerGraceArea(null);
        onPointerInTransitChange(false);
    }, [
        onPointerInTransitChange
    ]);
    const handleCreateGraceArea = $8wepK$useCallback((event, hoverTarget)=>{
        const currentTarget = event.currentTarget;
        const exitPoint = {
            x: event.clientX,
            y: event.clientY
        };
        const exitSide = $a093c7e1ec25a057$var$getExitSideFromRect(exitPoint, currentTarget.getBoundingClientRect());
        const paddedExitPoints = $a093c7e1ec25a057$var$getPaddedExitPoints(exitPoint, exitSide);
        const hoverTargetPoints = $a093c7e1ec25a057$var$getPointsFromRect(hoverTarget.getBoundingClientRect());
        const graceArea = $a093c7e1ec25a057$var$getHull([
            ...paddedExitPoints,
            ...hoverTargetPoints
        ]);
        setPointerGraceArea(graceArea);
        onPointerInTransitChange(true);
    }, [
        onPointerInTransitChange
    ]);
    $8wepK$useEffect(()=>{
        return ()=>handleRemoveGraceArea()
        ;
    }, [
        handleRemoveGraceArea
    ]);
    $8wepK$useEffect(()=>{
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
    $8wepK$useEffect(()=>{
        if (pointerGraceArea) {
            const handleTrackPointerGrace = (event)=>{
                const target = event.target;
                const pointerPosition = {
                    x: event.clientX,
                    y: event.clientY
                };
                const hasEnteredTarget = (trigger === null || trigger === void 0 ? void 0 : trigger.contains(target)) || (content === null || content === void 0 ? void 0 : content.contains(target));
                const isPointerOutsideGraceArea = !$a093c7e1ec25a057$var$isPointInPolygon(pointerPosition, pointerGraceArea);
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
    return /*#__PURE__*/ $8wepK$createElement($a093c7e1ec25a057$var$TooltipContentImpl, $8wepK$babelruntimehelpersesmextends({}, props, {
        ref: composedRefs
    }));
});
const [$a093c7e1ec25a057$var$VisuallyHiddenContentContextProvider, $a093c7e1ec25a057$var$useVisuallyHiddenContentContext] = $a093c7e1ec25a057$var$createTooltipContext($a093c7e1ec25a057$var$TOOLTIP_NAME, {
    isInside: false
});
const $a093c7e1ec25a057$var$TooltipContentImpl = /*#__PURE__*/ $8wepK$forwardRef((props, forwardedRef)=>{
    const { __scopeTooltip: __scopeTooltip , children: children , 'aria-label': ariaLabel , onEscapeKeyDown: onEscapeKeyDown , onPointerDownOutside: onPointerDownOutside , ...contentProps } = props;
    const context = $a093c7e1ec25a057$var$useTooltipContext($a093c7e1ec25a057$var$CONTENT_NAME, __scopeTooltip);
    const popperScope = $a093c7e1ec25a057$var$usePopperScope(__scopeTooltip);
    const { onClose: onClose  } = context; // Close this tooltip if another one opens
    $8wepK$useEffect(()=>{
        document.addEventListener($a093c7e1ec25a057$var$TOOLTIP_OPEN, onClose);
        return ()=>document.removeEventListener($a093c7e1ec25a057$var$TOOLTIP_OPEN, onClose)
        ;
    }, [
        onClose
    ]); // Close the tooltip if the trigger is scrolled
    $8wepK$useEffect(()=>{
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
    return /*#__PURE__*/ $8wepK$createElement($8wepK$DismissableLayer, {
        asChild: true,
        disableOutsidePointerEvents: false,
        onEscapeKeyDown: onEscapeKeyDown,
        onPointerDownOutside: onPointerDownOutside,
        onFocusOutside: (event)=>event.preventDefault()
        ,
        onDismiss: onClose
    }, /*#__PURE__*/ $8wepK$createElement($8wepK$Content, $8wepK$babelruntimehelpersesmextends({
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
    }), /*#__PURE__*/ $8wepK$createElement($8wepK$Slottable, null, children), /*#__PURE__*/ $8wepK$createElement($a093c7e1ec25a057$var$VisuallyHiddenContentContextProvider, {
        scope: __scopeTooltip,
        isInside: true
    }, /*#__PURE__*/ $8wepK$createElement($8wepK$Root1, {
        id: context.contentId,
        role: "tooltip"
    }, ariaLabel || children))));
});
/*#__PURE__*/ Object.assign($a093c7e1ec25a057$export$e9003e2be37ec060, {
    displayName: $a093c7e1ec25a057$var$CONTENT_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TooltipArrow
 * -----------------------------------------------------------------------------------------------*/ const $a093c7e1ec25a057$var$ARROW_NAME = 'TooltipArrow';
const $a093c7e1ec25a057$export$c27ee0ad710f7559 = /*#__PURE__*/ $8wepK$forwardRef((props, forwardedRef)=>{
    const { __scopeTooltip: __scopeTooltip , ...arrowProps } = props;
    const popperScope = $a093c7e1ec25a057$var$usePopperScope(__scopeTooltip);
    const visuallyHiddenContentContext = $a093c7e1ec25a057$var$useVisuallyHiddenContentContext($a093c7e1ec25a057$var$ARROW_NAME, __scopeTooltip); // if the arrow is inside the `VisuallyHidden`, we don't want to render it all to
    // prevent issues in positioning the arrow due to the duplicate
    return visuallyHiddenContentContext.isInside ? null : /*#__PURE__*/ $8wepK$createElement($8wepK$Arrow, $8wepK$babelruntimehelpersesmextends({}, popperScope, arrowProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($a093c7e1ec25a057$export$c27ee0ad710f7559, {
    displayName: $a093c7e1ec25a057$var$ARROW_NAME
});
/* -----------------------------------------------------------------------------------------------*/ function $a093c7e1ec25a057$var$getExitSideFromRect(point, rect) {
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
function $a093c7e1ec25a057$var$getPaddedExitPoints(exitPoint, exitSide, padding = 5) {
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
function $a093c7e1ec25a057$var$getPointsFromRect(rect) {
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
function $a093c7e1ec25a057$var$isPointInPolygon(point, polygon) {
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
function $a093c7e1ec25a057$var$getHull(points) {
    const newPoints = points.slice();
    newPoints.sort((a, b)=>{
        if (a.x < b.x) return -1;
        else if (a.x > b.x) return 1;
        else if (a.y < b.y) return -1;
        else if (a.y > b.y) return 1;
        else return 0;
    });
    return $a093c7e1ec25a057$var$getHullPresorted(newPoints);
} // Returns the convex hull, assuming that each points[i] <= points[i + 1]. Runs in O(n) time.
function $a093c7e1ec25a057$var$getHullPresorted(points) {
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
const $a093c7e1ec25a057$export$2881499e37b75b9a = $a093c7e1ec25a057$export$f78649fb9ca566b8;
const $a093c7e1ec25a057$export$be92b6f5f03c0fe9 = $a093c7e1ec25a057$export$28c660c63b792dea;
const $a093c7e1ec25a057$export$41fb9f06171c75f4 = $a093c7e1ec25a057$export$8c610744efcf8a1d;
const $a093c7e1ec25a057$export$602eac185826482c = $a093c7e1ec25a057$export$7b36b8f925ab7497;
const $a093c7e1ec25a057$export$7c6e2c02157bb7d2 = $a093c7e1ec25a057$export$e9003e2be37ec060;
const $a093c7e1ec25a057$export$21b07c8f274aebd5 = $a093c7e1ec25a057$export$c27ee0ad710f7559;




export {$a093c7e1ec25a057$export$1c540a2224f0d865 as createTooltipScope, $a093c7e1ec25a057$export$f78649fb9ca566b8 as TooltipProvider, $a093c7e1ec25a057$export$28c660c63b792dea as Tooltip, $a093c7e1ec25a057$export$8c610744efcf8a1d as TooltipTrigger, $a093c7e1ec25a057$export$7b36b8f925ab7497 as TooltipPortal, $a093c7e1ec25a057$export$e9003e2be37ec060 as TooltipContent, $a093c7e1ec25a057$export$c27ee0ad710f7559 as TooltipArrow, $a093c7e1ec25a057$export$2881499e37b75b9a as Provider, $a093c7e1ec25a057$export$be92b6f5f03c0fe9 as Root, $a093c7e1ec25a057$export$41fb9f06171c75f4 as Trigger, $a093c7e1ec25a057$export$602eac185826482c as Portal, $a093c7e1ec25a057$export$7c6e2c02157bb7d2 as Content, $a093c7e1ec25a057$export$21b07c8f274aebd5 as Arrow};
//# sourceMappingURL=index.mjs.map
