import $eRSIW$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {useRef as $eRSIW$useRef, useCallback as $eRSIW$useCallback, useEffect as $eRSIW$useEffect, createElement as $eRSIW$createElement, forwardRef as $eRSIW$forwardRef, useState as $eRSIW$useState} from "react";
import {composeEventHandlers as $eRSIW$composeEventHandlers} from "@radix-ui/primitive";
import {createContextScope as $eRSIW$createContextScope} from "@radix-ui/react-context";
import {useControllableState as $eRSIW$useControllableState} from "@radix-ui/react-use-controllable-state";
import {useComposedRefs as $eRSIW$useComposedRefs} from "@radix-ui/react-compose-refs";
import {createPopperScope as $eRSIW$createPopperScope, Root as $eRSIW$Root, Anchor as $eRSIW$Anchor, Content as $eRSIW$Content, Arrow as $eRSIW$Arrow} from "@radix-ui/react-popper";
import {Portal as $eRSIW$Portal} from "@radix-ui/react-portal";
import {Presence as $eRSIW$Presence} from "@radix-ui/react-presence";
import {Primitive as $eRSIW$Primitive} from "@radix-ui/react-primitive";
import {DismissableLayer as $eRSIW$DismissableLayer} from "@radix-ui/react-dismissable-layer";













/* -------------------------------------------------------------------------------------------------
 * HoverCard
 * -----------------------------------------------------------------------------------------------*/ let $cef8881cdc69808e$var$originalBodyUserSelect;
const $cef8881cdc69808e$var$HOVERCARD_NAME = 'HoverCard';
const [$cef8881cdc69808e$var$createHoverCardContext, $cef8881cdc69808e$export$47b6998a836b7260] = $eRSIW$createContextScope($cef8881cdc69808e$var$HOVERCARD_NAME, [
    $eRSIW$createPopperScope
]);
const $cef8881cdc69808e$var$usePopperScope = $eRSIW$createPopperScope();
const [$cef8881cdc69808e$var$HoverCardProvider, $cef8881cdc69808e$var$useHoverCardContext] = $cef8881cdc69808e$var$createHoverCardContext($cef8881cdc69808e$var$HOVERCARD_NAME);
const $cef8881cdc69808e$export$57a077cc9fbe653e = (props)=>{
    const { __scopeHoverCard: __scopeHoverCard , children: children , open: openProp , defaultOpen: defaultOpen , onOpenChange: onOpenChange , openDelay: openDelay = 700 , closeDelay: closeDelay = 300  } = props;
    const popperScope = $cef8881cdc69808e$var$usePopperScope(__scopeHoverCard);
    const openTimerRef = $eRSIW$useRef(0);
    const closeTimerRef = $eRSIW$useRef(0);
    const hasSelectionRef = $eRSIW$useRef(false);
    const isPointerDownOnContentRef = $eRSIW$useRef(false);
    const [open = false, setOpen] = $eRSIW$useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    const handleOpen = $eRSIW$useCallback(()=>{
        clearTimeout(closeTimerRef.current);
        openTimerRef.current = window.setTimeout(()=>setOpen(true)
        , openDelay);
    }, [
        openDelay,
        setOpen
    ]);
    const handleClose = $eRSIW$useCallback(()=>{
        clearTimeout(openTimerRef.current);
        if (!hasSelectionRef.current && !isPointerDownOnContentRef.current) closeTimerRef.current = window.setTimeout(()=>setOpen(false)
        , closeDelay);
    }, [
        closeDelay,
        setOpen
    ]);
    const handleDismiss = $eRSIW$useCallback(()=>setOpen(false)
    , [
        setOpen
    ]); // cleanup any queued state updates on unmount
    $eRSIW$useEffect(()=>{
        return ()=>{
            clearTimeout(openTimerRef.current);
            clearTimeout(closeTimerRef.current);
        };
    }, []);
    return /*#__PURE__*/ $eRSIW$createElement($cef8881cdc69808e$var$HoverCardProvider, {
        scope: __scopeHoverCard,
        open: open,
        onOpenChange: setOpen,
        onOpen: handleOpen,
        onClose: handleClose,
        onDismiss: handleDismiss,
        hasSelectionRef: hasSelectionRef,
        isPointerDownOnContentRef: isPointerDownOnContentRef
    }, /*#__PURE__*/ $eRSIW$createElement($eRSIW$Root, popperScope, children));
};
/*#__PURE__*/ Object.assign($cef8881cdc69808e$export$57a077cc9fbe653e, {
    displayName: $cef8881cdc69808e$var$HOVERCARD_NAME
});
/* -------------------------------------------------------------------------------------------------
 * HoverCardTrigger
 * -----------------------------------------------------------------------------------------------*/ const $cef8881cdc69808e$var$TRIGGER_NAME = 'HoverCardTrigger';
const $cef8881cdc69808e$export$ef9f7fd8e4ba882f = /*#__PURE__*/ $eRSIW$forwardRef((props, forwardedRef)=>{
    const { __scopeHoverCard: __scopeHoverCard , ...triggerProps } = props;
    const context = $cef8881cdc69808e$var$useHoverCardContext($cef8881cdc69808e$var$TRIGGER_NAME, __scopeHoverCard);
    const popperScope = $cef8881cdc69808e$var$usePopperScope(__scopeHoverCard);
    return /*#__PURE__*/ $eRSIW$createElement($eRSIW$Anchor, $eRSIW$babelruntimehelpersesmextends({
        asChild: true
    }, popperScope), /*#__PURE__*/ $eRSIW$createElement($eRSIW$Primitive.a, $eRSIW$babelruntimehelpersesmextends({
        "data-state": context.open ? 'open' : 'closed'
    }, triggerProps, {
        ref: forwardedRef,
        onPointerEnter: $eRSIW$composeEventHandlers(props.onPointerEnter, $cef8881cdc69808e$var$excludeTouch(context.onOpen)),
        onPointerLeave: $eRSIW$composeEventHandlers(props.onPointerLeave, $cef8881cdc69808e$var$excludeTouch(context.onClose)),
        onFocus: $eRSIW$composeEventHandlers(props.onFocus, context.onOpen),
        onBlur: $eRSIW$composeEventHandlers(props.onBlur, context.onClose) // prevent focus event on touch devices
        ,
        onTouchStart: $eRSIW$composeEventHandlers(props.onTouchStart, (event)=>event.preventDefault()
        )
    })));
});
/*#__PURE__*/ Object.assign($cef8881cdc69808e$export$ef9f7fd8e4ba882f, {
    displayName: $cef8881cdc69808e$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * HoverCardPortal
 * -----------------------------------------------------------------------------------------------*/ const $cef8881cdc69808e$var$PORTAL_NAME = 'HoverCardPortal';
const [$cef8881cdc69808e$var$PortalProvider, $cef8881cdc69808e$var$usePortalContext] = $cef8881cdc69808e$var$createHoverCardContext($cef8881cdc69808e$var$PORTAL_NAME, {
    forceMount: undefined
});
const $cef8881cdc69808e$export$b384c6e0a789f88b = (props)=>{
    const { __scopeHoverCard: __scopeHoverCard , forceMount: forceMount , children: children , container: container  } = props;
    const context = $cef8881cdc69808e$var$useHoverCardContext($cef8881cdc69808e$var$PORTAL_NAME, __scopeHoverCard);
    return /*#__PURE__*/ $eRSIW$createElement($cef8881cdc69808e$var$PortalProvider, {
        scope: __scopeHoverCard,
        forceMount: forceMount
    }, /*#__PURE__*/ $eRSIW$createElement($eRSIW$Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $eRSIW$createElement($eRSIW$Portal, {
        asChild: true,
        container: container
    }, children)));
};
/*#__PURE__*/ Object.assign($cef8881cdc69808e$export$b384c6e0a789f88b, {
    displayName: $cef8881cdc69808e$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * HoverCardContent
 * -----------------------------------------------------------------------------------------------*/ const $cef8881cdc69808e$var$CONTENT_NAME = 'HoverCardContent';
const $cef8881cdc69808e$export$aa4724a5938c586 = /*#__PURE__*/ $eRSIW$forwardRef((props, forwardedRef)=>{
    const portalContext = $cef8881cdc69808e$var$usePortalContext($cef8881cdc69808e$var$CONTENT_NAME, props.__scopeHoverCard);
    const { forceMount: forceMount = portalContext.forceMount , ...contentProps } = props;
    const context = $cef8881cdc69808e$var$useHoverCardContext($cef8881cdc69808e$var$CONTENT_NAME, props.__scopeHoverCard);
    return /*#__PURE__*/ $eRSIW$createElement($eRSIW$Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $eRSIW$createElement($cef8881cdc69808e$var$HoverCardContentImpl, $eRSIW$babelruntimehelpersesmextends({
        "data-state": context.open ? 'open' : 'closed'
    }, contentProps, {
        onPointerEnter: $eRSIW$composeEventHandlers(props.onPointerEnter, $cef8881cdc69808e$var$excludeTouch(context.onOpen)),
        onPointerLeave: $eRSIW$composeEventHandlers(props.onPointerLeave, $cef8881cdc69808e$var$excludeTouch(context.onClose)),
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($cef8881cdc69808e$export$aa4724a5938c586, {
    displayName: $cef8881cdc69808e$var$CONTENT_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $cef8881cdc69808e$var$HoverCardContentImpl = /*#__PURE__*/ $eRSIW$forwardRef((props, forwardedRef)=>{
    const { __scopeHoverCard: __scopeHoverCard , onEscapeKeyDown: onEscapeKeyDown , onPointerDownOutside: onPointerDownOutside , onFocusOutside: onFocusOutside , onInteractOutside: onInteractOutside , ...contentProps } = props;
    const context = $cef8881cdc69808e$var$useHoverCardContext($cef8881cdc69808e$var$CONTENT_NAME, __scopeHoverCard);
    const popperScope = $cef8881cdc69808e$var$usePopperScope(__scopeHoverCard);
    const ref = $eRSIW$useRef(null);
    const composedRefs = $eRSIW$useComposedRefs(forwardedRef, ref);
    const [containSelection, setContainSelection] = $eRSIW$useState(false);
    $eRSIW$useEffect(()=>{
        if (containSelection) {
            const body = document.body; // Safari requires prefix
            $cef8881cdc69808e$var$originalBodyUserSelect = body.style.userSelect || body.style.webkitUserSelect;
            body.style.userSelect = 'none';
            body.style.webkitUserSelect = 'none';
            return ()=>{
                body.style.userSelect = $cef8881cdc69808e$var$originalBodyUserSelect;
                body.style.webkitUserSelect = $cef8881cdc69808e$var$originalBodyUserSelect;
            };
        }
    }, [
        containSelection
    ]);
    $eRSIW$useEffect(()=>{
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
    $eRSIW$useEffect(()=>{
        if (ref.current) {
            const tabbables = $cef8881cdc69808e$var$getTabbableNodes(ref.current);
            tabbables.forEach((tabbable)=>tabbable.setAttribute('tabindex', '-1')
            );
        }
    });
    return /*#__PURE__*/ $eRSIW$createElement($eRSIW$DismissableLayer, {
        asChild: true,
        disableOutsidePointerEvents: false,
        onInteractOutside: onInteractOutside,
        onEscapeKeyDown: onEscapeKeyDown,
        onPointerDownOutside: onPointerDownOutside,
        onFocusOutside: $eRSIW$composeEventHandlers(onFocusOutside, (event)=>{
            event.preventDefault();
        }),
        onDismiss: context.onDismiss
    }, /*#__PURE__*/ $eRSIW$createElement($eRSIW$Content, $eRSIW$babelruntimehelpersesmextends({}, popperScope, contentProps, {
        onPointerDown: $eRSIW$composeEventHandlers(contentProps.onPointerDown, (event)=>{
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
 * -----------------------------------------------------------------------------------------------*/ const $cef8881cdc69808e$var$ARROW_NAME = 'HoverCardArrow';
const $cef8881cdc69808e$export$b9744d3e7456d806 = /*#__PURE__*/ $eRSIW$forwardRef((props, forwardedRef)=>{
    const { __scopeHoverCard: __scopeHoverCard , ...arrowProps } = props;
    const popperScope = $cef8881cdc69808e$var$usePopperScope(__scopeHoverCard);
    return /*#__PURE__*/ $eRSIW$createElement($eRSIW$Arrow, $eRSIW$babelruntimehelpersesmextends({}, popperScope, arrowProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($cef8881cdc69808e$export$b9744d3e7456d806, {
    displayName: $cef8881cdc69808e$var$ARROW_NAME
});
/* -----------------------------------------------------------------------------------------------*/ function $cef8881cdc69808e$var$excludeTouch(eventHandler) {
    return (event)=>event.pointerType === 'touch' ? undefined : eventHandler()
    ;
}
/**
 * Returns a list of nodes that can be in the tab sequence.
 * @see: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
 */ function $cef8881cdc69808e$var$getTabbableNodes(container) {
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
const $cef8881cdc69808e$export$be92b6f5f03c0fe9 = $cef8881cdc69808e$export$57a077cc9fbe653e;
const $cef8881cdc69808e$export$41fb9f06171c75f4 = $cef8881cdc69808e$export$ef9f7fd8e4ba882f;
const $cef8881cdc69808e$export$602eac185826482c = $cef8881cdc69808e$export$b384c6e0a789f88b;
const $cef8881cdc69808e$export$7c6e2c02157bb7d2 = $cef8881cdc69808e$export$aa4724a5938c586;
const $cef8881cdc69808e$export$21b07c8f274aebd5 = $cef8881cdc69808e$export$b9744d3e7456d806;




export {$cef8881cdc69808e$export$47b6998a836b7260 as createHoverCardScope, $cef8881cdc69808e$export$57a077cc9fbe653e as HoverCard, $cef8881cdc69808e$export$ef9f7fd8e4ba882f as HoverCardTrigger, $cef8881cdc69808e$export$b384c6e0a789f88b as HoverCardPortal, $cef8881cdc69808e$export$aa4724a5938c586 as HoverCardContent, $cef8881cdc69808e$export$b9744d3e7456d806 as HoverCardArrow, $cef8881cdc69808e$export$be92b6f5f03c0fe9 as Root, $cef8881cdc69808e$export$41fb9f06171c75f4 as Trigger, $cef8881cdc69808e$export$602eac185826482c as Portal, $cef8881cdc69808e$export$7c6e2c02157bb7d2 as Content, $cef8881cdc69808e$export$21b07c8f274aebd5 as Arrow};
//# sourceMappingURL=index.mjs.map
