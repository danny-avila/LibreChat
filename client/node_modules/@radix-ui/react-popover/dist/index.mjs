import $am6gm$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {useRef as $am6gm$useRef, useState as $am6gm$useState, createElement as $am6gm$createElement, useCallback as $am6gm$useCallback, forwardRef as $am6gm$forwardRef, useEffect as $am6gm$useEffect} from "react";
import {composeEventHandlers as $am6gm$composeEventHandlers} from "@radix-ui/primitive";
import {useComposedRefs as $am6gm$useComposedRefs} from "@radix-ui/react-compose-refs";
import {createContextScope as $am6gm$createContextScope} from "@radix-ui/react-context";
import {DismissableLayer as $am6gm$DismissableLayer} from "@radix-ui/react-dismissable-layer";
import {useFocusGuards as $am6gm$useFocusGuards} from "@radix-ui/react-focus-guards";
import {FocusScope as $am6gm$FocusScope} from "@radix-ui/react-focus-scope";
import {useId as $am6gm$useId} from "@radix-ui/react-id";
import {createPopperScope as $am6gm$createPopperScope, Root as $am6gm$Root, Anchor as $am6gm$Anchor, Content as $am6gm$Content, Arrow as $am6gm$Arrow} from "@radix-ui/react-popper";
import {Portal as $am6gm$Portal} from "@radix-ui/react-portal";
import {Presence as $am6gm$Presence} from "@radix-ui/react-presence";
import {Primitive as $am6gm$Primitive} from "@radix-ui/react-primitive";
import {Slot as $am6gm$Slot} from "@radix-ui/react-slot";
import {useControllableState as $am6gm$useControllableState} from "@radix-ui/react-use-controllable-state";
import {hideOthers as $am6gm$hideOthers} from "aria-hidden";
import {RemoveScroll as $am6gm$RemoveScroll} from "react-remove-scroll";



















/* -------------------------------------------------------------------------------------------------
 * Popover
 * -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$POPOVER_NAME = 'Popover';
const [$cb5cc270b50c6fcd$var$createPopoverContext, $cb5cc270b50c6fcd$export$c8393c9e73286932] = $am6gm$createContextScope($cb5cc270b50c6fcd$var$POPOVER_NAME, [
    $am6gm$createPopperScope
]);
const $cb5cc270b50c6fcd$var$usePopperScope = $am6gm$createPopperScope();
const [$cb5cc270b50c6fcd$var$PopoverProvider, $cb5cc270b50c6fcd$var$usePopoverContext] = $cb5cc270b50c6fcd$var$createPopoverContext($cb5cc270b50c6fcd$var$POPOVER_NAME);
const $cb5cc270b50c6fcd$export$5b6b19405a83ff9d = (props)=>{
    const { __scopePopover: __scopePopover , children: children , open: openProp , defaultOpen: defaultOpen , onOpenChange: onOpenChange , modal: modal = false  } = props;
    const popperScope = $cb5cc270b50c6fcd$var$usePopperScope(__scopePopover);
    const triggerRef = $am6gm$useRef(null);
    const [hasCustomAnchor, setHasCustomAnchor] = $am6gm$useState(false);
    const [open = false, setOpen] = $am6gm$useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    return /*#__PURE__*/ $am6gm$createElement($am6gm$Root, popperScope, /*#__PURE__*/ $am6gm$createElement($cb5cc270b50c6fcd$var$PopoverProvider, {
        scope: __scopePopover,
        contentId: $am6gm$useId(),
        triggerRef: triggerRef,
        open: open,
        onOpenChange: setOpen,
        onOpenToggle: $am6gm$useCallback(()=>setOpen((prevOpen)=>!prevOpen
            )
        , [
            setOpen
        ]),
        hasCustomAnchor: hasCustomAnchor,
        onCustomAnchorAdd: $am6gm$useCallback(()=>setHasCustomAnchor(true)
        , []),
        onCustomAnchorRemove: $am6gm$useCallback(()=>setHasCustomAnchor(false)
        , []),
        modal: modal
    }, children));
};
/*#__PURE__*/ Object.assign($cb5cc270b50c6fcd$export$5b6b19405a83ff9d, {
    displayName: $cb5cc270b50c6fcd$var$POPOVER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverAnchor
 * -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$ANCHOR_NAME = 'PopoverAnchor';
const $cb5cc270b50c6fcd$export$96e5381f42521a79 = /*#__PURE__*/ $am6gm$forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , ...anchorProps } = props;
    const context = $cb5cc270b50c6fcd$var$usePopoverContext($cb5cc270b50c6fcd$var$ANCHOR_NAME, __scopePopover);
    const popperScope = $cb5cc270b50c6fcd$var$usePopperScope(__scopePopover);
    const { onCustomAnchorAdd: onCustomAnchorAdd , onCustomAnchorRemove: onCustomAnchorRemove  } = context;
    $am6gm$useEffect(()=>{
        onCustomAnchorAdd();
        return ()=>onCustomAnchorRemove()
        ;
    }, [
        onCustomAnchorAdd,
        onCustomAnchorRemove
    ]);
    return /*#__PURE__*/ $am6gm$createElement($am6gm$Anchor, $am6gm$babelruntimehelpersesmextends({}, popperScope, anchorProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($cb5cc270b50c6fcd$export$96e5381f42521a79, {
    displayName: $cb5cc270b50c6fcd$var$ANCHOR_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverTrigger
 * -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$TRIGGER_NAME = 'PopoverTrigger';
const $cb5cc270b50c6fcd$export$7dacb05d26466c3 = /*#__PURE__*/ $am6gm$forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , ...triggerProps } = props;
    const context = $cb5cc270b50c6fcd$var$usePopoverContext($cb5cc270b50c6fcd$var$TRIGGER_NAME, __scopePopover);
    const popperScope = $cb5cc270b50c6fcd$var$usePopperScope(__scopePopover);
    const composedTriggerRef = $am6gm$useComposedRefs(forwardedRef, context.triggerRef);
    const trigger = /*#__PURE__*/ $am6gm$createElement($am6gm$Primitive.button, $am6gm$babelruntimehelpersesmextends({
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": context.open,
        "aria-controls": context.contentId,
        "data-state": $cb5cc270b50c6fcd$var$getState(context.open)
    }, triggerProps, {
        ref: composedTriggerRef,
        onClick: $am6gm$composeEventHandlers(props.onClick, context.onOpenToggle)
    }));
    return context.hasCustomAnchor ? trigger : /*#__PURE__*/ $am6gm$createElement($am6gm$Anchor, $am6gm$babelruntimehelpersesmextends({
        asChild: true
    }, popperScope), trigger);
});
/*#__PURE__*/ Object.assign($cb5cc270b50c6fcd$export$7dacb05d26466c3, {
    displayName: $cb5cc270b50c6fcd$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverPortal
 * -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$PORTAL_NAME = 'PopoverPortal';
const [$cb5cc270b50c6fcd$var$PortalProvider, $cb5cc270b50c6fcd$var$usePortalContext] = $cb5cc270b50c6fcd$var$createPopoverContext($cb5cc270b50c6fcd$var$PORTAL_NAME, {
    forceMount: undefined
});
const $cb5cc270b50c6fcd$export$dd679ffb4362d2d4 = (props)=>{
    const { __scopePopover: __scopePopover , forceMount: forceMount , children: children , container: container  } = props;
    const context = $cb5cc270b50c6fcd$var$usePopoverContext($cb5cc270b50c6fcd$var$PORTAL_NAME, __scopePopover);
    return /*#__PURE__*/ $am6gm$createElement($cb5cc270b50c6fcd$var$PortalProvider, {
        scope: __scopePopover,
        forceMount: forceMount
    }, /*#__PURE__*/ $am6gm$createElement($am6gm$Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $am6gm$createElement($am6gm$Portal, {
        asChild: true,
        container: container
    }, children)));
};
/*#__PURE__*/ Object.assign($cb5cc270b50c6fcd$export$dd679ffb4362d2d4, {
    displayName: $cb5cc270b50c6fcd$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverContent
 * -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$CONTENT_NAME = 'PopoverContent';
const $cb5cc270b50c6fcd$export$d7e1f420b25549ff = /*#__PURE__*/ $am6gm$forwardRef((props, forwardedRef)=>{
    const portalContext = $cb5cc270b50c6fcd$var$usePortalContext($cb5cc270b50c6fcd$var$CONTENT_NAME, props.__scopePopover);
    const { forceMount: forceMount = portalContext.forceMount , ...contentProps } = props;
    const context = $cb5cc270b50c6fcd$var$usePopoverContext($cb5cc270b50c6fcd$var$CONTENT_NAME, props.__scopePopover);
    return /*#__PURE__*/ $am6gm$createElement($am6gm$Presence, {
        present: forceMount || context.open
    }, context.modal ? /*#__PURE__*/ $am6gm$createElement($cb5cc270b50c6fcd$var$PopoverContentModal, $am6gm$babelruntimehelpersesmextends({}, contentProps, {
        ref: forwardedRef
    })) : /*#__PURE__*/ $am6gm$createElement($cb5cc270b50c6fcd$var$PopoverContentNonModal, $am6gm$babelruntimehelpersesmextends({}, contentProps, {
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($cb5cc270b50c6fcd$export$d7e1f420b25549ff, {
    displayName: $cb5cc270b50c6fcd$var$CONTENT_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$PopoverContentModal = /*#__PURE__*/ $am6gm$forwardRef((props, forwardedRef)=>{
    const context = $cb5cc270b50c6fcd$var$usePopoverContext($cb5cc270b50c6fcd$var$CONTENT_NAME, props.__scopePopover);
    const contentRef = $am6gm$useRef(null);
    const composedRefs = $am6gm$useComposedRefs(forwardedRef, contentRef);
    const isRightClickOutsideRef = $am6gm$useRef(false); // aria-hide everything except the content (better supported equivalent to setting aria-modal)
    $am6gm$useEffect(()=>{
        const content = contentRef.current;
        if (content) return $am6gm$hideOthers(content);
    }, []);
    return /*#__PURE__*/ $am6gm$createElement($am6gm$RemoveScroll, {
        as: $am6gm$Slot,
        allowPinchZoom: true
    }, /*#__PURE__*/ $am6gm$createElement($cb5cc270b50c6fcd$var$PopoverContentImpl, $am6gm$babelruntimehelpersesmextends({}, props, {
        ref: composedRefs // we make sure we're not trapping once it's been closed
        ,
        trapFocus: context.open,
        disableOutsidePointerEvents: true,
        onCloseAutoFocus: $am6gm$composeEventHandlers(props.onCloseAutoFocus, (event)=>{
            var _context$triggerRef$c;
            event.preventDefault();
            if (!isRightClickOutsideRef.current) (_context$triggerRef$c = context.triggerRef.current) === null || _context$triggerRef$c === void 0 || _context$triggerRef$c.focus();
        }),
        onPointerDownOutside: $am6gm$composeEventHandlers(props.onPointerDownOutside, (event)=>{
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            isRightClickOutsideRef.current = isRightClick;
        }, {
            checkForDefaultPrevented: false
        }) // When focus is trapped, a `focusout` event may still happen.
        ,
        onFocusOutside: $am6gm$composeEventHandlers(props.onFocusOutside, (event)=>event.preventDefault()
        , {
            checkForDefaultPrevented: false
        })
    })));
});
const $cb5cc270b50c6fcd$var$PopoverContentNonModal = /*#__PURE__*/ $am6gm$forwardRef((props, forwardedRef)=>{
    const context = $cb5cc270b50c6fcd$var$usePopoverContext($cb5cc270b50c6fcd$var$CONTENT_NAME, props.__scopePopover);
    const hasInteractedOutsideRef = $am6gm$useRef(false);
    const hasPointerDownOutsideRef = $am6gm$useRef(false);
    return /*#__PURE__*/ $am6gm$createElement($cb5cc270b50c6fcd$var$PopoverContentImpl, $am6gm$babelruntimehelpersesmextends({}, props, {
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
/* -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$PopoverContentImpl = /*#__PURE__*/ $am6gm$forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , trapFocus: trapFocus , onOpenAutoFocus: onOpenAutoFocus , onCloseAutoFocus: onCloseAutoFocus , disableOutsidePointerEvents: disableOutsidePointerEvents , onEscapeKeyDown: onEscapeKeyDown , onPointerDownOutside: onPointerDownOutside , onFocusOutside: onFocusOutside , onInteractOutside: onInteractOutside , ...contentProps } = props;
    const context = $cb5cc270b50c6fcd$var$usePopoverContext($cb5cc270b50c6fcd$var$CONTENT_NAME, __scopePopover);
    const popperScope = $cb5cc270b50c6fcd$var$usePopperScope(__scopePopover); // Make sure the whole tree has focus guards as our `Popover` may be
    // the last element in the DOM (beacuse of the `Portal`)
    $am6gm$useFocusGuards();
    return /*#__PURE__*/ $am6gm$createElement($am6gm$FocusScope, {
        asChild: true,
        loop: true,
        trapped: trapFocus,
        onMountAutoFocus: onOpenAutoFocus,
        onUnmountAutoFocus: onCloseAutoFocus
    }, /*#__PURE__*/ $am6gm$createElement($am6gm$DismissableLayer, {
        asChild: true,
        disableOutsidePointerEvents: disableOutsidePointerEvents,
        onInteractOutside: onInteractOutside,
        onEscapeKeyDown: onEscapeKeyDown,
        onPointerDownOutside: onPointerDownOutside,
        onFocusOutside: onFocusOutside,
        onDismiss: ()=>context.onOpenChange(false)
    }, /*#__PURE__*/ $am6gm$createElement($am6gm$Content, $am6gm$babelruntimehelpersesmextends({
        "data-state": $cb5cc270b50c6fcd$var$getState(context.open),
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
 * -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$CLOSE_NAME = 'PopoverClose';
const $cb5cc270b50c6fcd$export$d6ac43ebaa40d53e = /*#__PURE__*/ $am6gm$forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , ...closeProps } = props;
    const context = $cb5cc270b50c6fcd$var$usePopoverContext($cb5cc270b50c6fcd$var$CLOSE_NAME, __scopePopover);
    return /*#__PURE__*/ $am6gm$createElement($am6gm$Primitive.button, $am6gm$babelruntimehelpersesmextends({
        type: "button"
    }, closeProps, {
        ref: forwardedRef,
        onClick: $am6gm$composeEventHandlers(props.onClick, ()=>context.onOpenChange(false)
        )
    }));
});
/*#__PURE__*/ Object.assign($cb5cc270b50c6fcd$export$d6ac43ebaa40d53e, {
    displayName: $cb5cc270b50c6fcd$var$CLOSE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * PopoverArrow
 * -----------------------------------------------------------------------------------------------*/ const $cb5cc270b50c6fcd$var$ARROW_NAME = 'PopoverArrow';
const $cb5cc270b50c6fcd$export$3152841115e061b2 = /*#__PURE__*/ $am6gm$forwardRef((props, forwardedRef)=>{
    const { __scopePopover: __scopePopover , ...arrowProps } = props;
    const popperScope = $cb5cc270b50c6fcd$var$usePopperScope(__scopePopover);
    return /*#__PURE__*/ $am6gm$createElement($am6gm$Arrow, $am6gm$babelruntimehelpersesmextends({}, popperScope, arrowProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($cb5cc270b50c6fcd$export$3152841115e061b2, {
    displayName: $cb5cc270b50c6fcd$var$ARROW_NAME
});
/* -----------------------------------------------------------------------------------------------*/ function $cb5cc270b50c6fcd$var$getState(open) {
    return open ? 'open' : 'closed';
}
const $cb5cc270b50c6fcd$export$be92b6f5f03c0fe9 = $cb5cc270b50c6fcd$export$5b6b19405a83ff9d;
const $cb5cc270b50c6fcd$export$b688253958b8dfe7 = $cb5cc270b50c6fcd$export$96e5381f42521a79;
const $cb5cc270b50c6fcd$export$41fb9f06171c75f4 = $cb5cc270b50c6fcd$export$7dacb05d26466c3;
const $cb5cc270b50c6fcd$export$602eac185826482c = $cb5cc270b50c6fcd$export$dd679ffb4362d2d4;
const $cb5cc270b50c6fcd$export$7c6e2c02157bb7d2 = $cb5cc270b50c6fcd$export$d7e1f420b25549ff;
const $cb5cc270b50c6fcd$export$f39c2d165cd861fe = $cb5cc270b50c6fcd$export$d6ac43ebaa40d53e;
const $cb5cc270b50c6fcd$export$21b07c8f274aebd5 = $cb5cc270b50c6fcd$export$3152841115e061b2;




export {$cb5cc270b50c6fcd$export$c8393c9e73286932 as createPopoverScope, $cb5cc270b50c6fcd$export$5b6b19405a83ff9d as Popover, $cb5cc270b50c6fcd$export$96e5381f42521a79 as PopoverAnchor, $cb5cc270b50c6fcd$export$7dacb05d26466c3 as PopoverTrigger, $cb5cc270b50c6fcd$export$dd679ffb4362d2d4 as PopoverPortal, $cb5cc270b50c6fcd$export$d7e1f420b25549ff as PopoverContent, $cb5cc270b50c6fcd$export$d6ac43ebaa40d53e as PopoverClose, $cb5cc270b50c6fcd$export$3152841115e061b2 as PopoverArrow, $cb5cc270b50c6fcd$export$be92b6f5f03c0fe9 as Root, $cb5cc270b50c6fcd$export$b688253958b8dfe7 as Anchor, $cb5cc270b50c6fcd$export$41fb9f06171c75f4 as Trigger, $cb5cc270b50c6fcd$export$602eac185826482c as Portal, $cb5cc270b50c6fcd$export$7c6e2c02157bb7d2 as Content, $cb5cc270b50c6fcd$export$f39c2d165cd861fe as Close, $cb5cc270b50c6fcd$export$21b07c8f274aebd5 as Arrow};
//# sourceMappingURL=index.mjs.map
