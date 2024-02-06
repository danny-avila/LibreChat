import $eyrYI$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {useState as $eyrYI$useState, useRef as $eyrYI$useRef, createElement as $eyrYI$createElement, useCallback as $eyrYI$useCallback, forwardRef as $eyrYI$forwardRef, useEffect as $eyrYI$useEffect, useMemo as $eyrYI$useMemo, Fragment as $eyrYI$Fragment} from "react";
import {createPortal as $eyrYI$createPortal} from "react-dom";
import {composeEventHandlers as $eyrYI$composeEventHandlers} from "@radix-ui/primitive";
import {useComposedRefs as $eyrYI$useComposedRefs} from "@radix-ui/react-compose-refs";
import {createCollection as $eyrYI$createCollection} from "@radix-ui/react-collection";
import {createContextScope as $eyrYI$createContextScope} from "@radix-ui/react-context";
import {Branch as $eyrYI$Branch, Root as $eyrYI$Root} from "@radix-ui/react-dismissable-layer";
import {Portal as $eyrYI$Portal} from "@radix-ui/react-portal";
import {Presence as $eyrYI$Presence} from "@radix-ui/react-presence";
import {Primitive as $eyrYI$Primitive, dispatchDiscreteCustomEvent as $eyrYI$dispatchDiscreteCustomEvent} from "@radix-ui/react-primitive";
import {useCallbackRef as $eyrYI$useCallbackRef} from "@radix-ui/react-use-callback-ref";
import {useControllableState as $eyrYI$useControllableState} from "@radix-ui/react-use-controllable-state";
import {useLayoutEffect as $eyrYI$useLayoutEffect} from "@radix-ui/react-use-layout-effect";
import {VisuallyHidden as $eyrYI$VisuallyHidden} from "@radix-ui/react-visually-hidden";
















/* -------------------------------------------------------------------------------------------------
 * ToastProvider
 * -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$PROVIDER_NAME = 'ToastProvider';
const [$054eb8030ebde76e$var$Collection, $054eb8030ebde76e$var$useCollection, $054eb8030ebde76e$var$createCollectionScope] = $eyrYI$createCollection('Toast');
const [$054eb8030ebde76e$var$createToastContext, $054eb8030ebde76e$export$8a359da18fbc9073] = $eyrYI$createContextScope('Toast', [
    $054eb8030ebde76e$var$createCollectionScope
]);
const [$054eb8030ebde76e$var$ToastProviderProvider, $054eb8030ebde76e$var$useToastProviderContext] = $054eb8030ebde76e$var$createToastContext($054eb8030ebde76e$var$PROVIDER_NAME);
const $054eb8030ebde76e$export$f5d03d415824e0e = (props)=>{
    const { __scopeToast: __scopeToast , label: label = 'Notification' , duration: duration = 5000 , swipeDirection: swipeDirection = 'right' , swipeThreshold: swipeThreshold = 50 , children: children  } = props;
    const [viewport, setViewport] = $eyrYI$useState(null);
    const [toastCount, setToastCount] = $eyrYI$useState(0);
    const isFocusedToastEscapeKeyDownRef = $eyrYI$useRef(false);
    const isClosePausedRef = $eyrYI$useRef(false);
    return /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$Collection.Provider, {
        scope: __scopeToast
    }, /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$ToastProviderProvider, {
        scope: __scopeToast,
        label: label,
        duration: duration,
        swipeDirection: swipeDirection,
        swipeThreshold: swipeThreshold,
        toastCount: toastCount,
        viewport: viewport,
        onViewportChange: setViewport,
        onToastAdd: $eyrYI$useCallback(()=>setToastCount((prevCount)=>prevCount + 1
            )
        , []),
        onToastRemove: $eyrYI$useCallback(()=>setToastCount((prevCount)=>prevCount - 1
            )
        , []),
        isFocusedToastEscapeKeyDownRef: isFocusedToastEscapeKeyDownRef,
        isClosePausedRef: isClosePausedRef
    }, children));
};
$054eb8030ebde76e$export$f5d03d415824e0e.propTypes = {
    label (props) {
        if (props.label && typeof props.label === 'string' && !props.label.trim()) {
            const error = `Invalid prop \`label\` supplied to \`${$054eb8030ebde76e$var$PROVIDER_NAME}\`. Expected non-empty \`string\`.`;
            return new Error(error);
        }
        return null;
    }
};
/*#__PURE__*/ Object.assign($054eb8030ebde76e$export$f5d03d415824e0e, {
    displayName: $054eb8030ebde76e$var$PROVIDER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * ToastViewport
 * -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$VIEWPORT_NAME = 'ToastViewport';
const $054eb8030ebde76e$var$VIEWPORT_DEFAULT_HOTKEY = [
    'F8'
];
const $054eb8030ebde76e$var$VIEWPORT_PAUSE = 'toast.viewportPause';
const $054eb8030ebde76e$var$VIEWPORT_RESUME = 'toast.viewportResume';
const $054eb8030ebde76e$export$6192c2425ecfd989 = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , hotkey: hotkey = $054eb8030ebde76e$var$VIEWPORT_DEFAULT_HOTKEY , label: label = 'Notifications ({hotkey})' , ...viewportProps } = props;
    const context = $054eb8030ebde76e$var$useToastProviderContext($054eb8030ebde76e$var$VIEWPORT_NAME, __scopeToast);
    const getItems = $054eb8030ebde76e$var$useCollection(__scopeToast);
    const wrapperRef = $eyrYI$useRef(null);
    const headFocusProxyRef = $eyrYI$useRef(null);
    const tailFocusProxyRef = $eyrYI$useRef(null);
    const ref = $eyrYI$useRef(null);
    const composedRefs = $eyrYI$useComposedRefs(forwardedRef, ref, context.onViewportChange);
    const hotkeyLabel = hotkey.join('+').replace(/Key/g, '').replace(/Digit/g, '');
    const hasToasts = context.toastCount > 0;
    $eyrYI$useEffect(()=>{
        const handleKeyDown = (event)=>{
            var _ref$current;
            // we use `event.code` as it is consistent regardless of meta keys that were pressed.
            // for example, `event.key` for `Control+Alt+t` is `†` and `t !== †`
            const isHotkeyPressed = hotkey.every((key)=>event[key] || event.code === key
            );
            if (isHotkeyPressed) (_ref$current = ref.current) === null || _ref$current === void 0 || _ref$current.focus();
        };
        document.addEventListener('keydown', handleKeyDown);
        return ()=>document.removeEventListener('keydown', handleKeyDown)
        ;
    }, [
        hotkey
    ]);
    $eyrYI$useEffect(()=>{
        const wrapper = wrapperRef.current;
        const viewport = ref.current;
        if (hasToasts && wrapper && viewport) {
            const handlePause = ()=>{
                if (!context.isClosePausedRef.current) {
                    const pauseEvent = new CustomEvent($054eb8030ebde76e$var$VIEWPORT_PAUSE);
                    viewport.dispatchEvent(pauseEvent);
                    context.isClosePausedRef.current = true;
                }
            };
            const handleResume = ()=>{
                if (context.isClosePausedRef.current) {
                    const resumeEvent = new CustomEvent($054eb8030ebde76e$var$VIEWPORT_RESUME);
                    viewport.dispatchEvent(resumeEvent);
                    context.isClosePausedRef.current = false;
                }
            };
            const handleFocusOutResume = (event)=>{
                const isFocusMovingOutside = !wrapper.contains(event.relatedTarget);
                if (isFocusMovingOutside) handleResume();
            };
            const handlePointerLeaveResume = ()=>{
                const isFocusInside = wrapper.contains(document.activeElement);
                if (!isFocusInside) handleResume();
            }; // Toasts are not in the viewport React tree so we need to bind DOM events
            wrapper.addEventListener('focusin', handlePause);
            wrapper.addEventListener('focusout', handleFocusOutResume);
            wrapper.addEventListener('pointermove', handlePause);
            wrapper.addEventListener('pointerleave', handlePointerLeaveResume);
            window.addEventListener('blur', handlePause);
            window.addEventListener('focus', handleResume);
            return ()=>{
                wrapper.removeEventListener('focusin', handlePause);
                wrapper.removeEventListener('focusout', handleFocusOutResume);
                wrapper.removeEventListener('pointermove', handlePause);
                wrapper.removeEventListener('pointerleave', handlePointerLeaveResume);
                window.removeEventListener('blur', handlePause);
                window.removeEventListener('focus', handleResume);
            };
        }
    }, [
        hasToasts,
        context.isClosePausedRef
    ]);
    const getSortedTabbableCandidates = $eyrYI$useCallback(({ tabbingDirection: tabbingDirection  })=>{
        const toastItems = getItems();
        const tabbableCandidates = toastItems.map((toastItem)=>{
            const toastNode = toastItem.ref.current;
            const toastTabbableCandidates = [
                toastNode,
                ...$054eb8030ebde76e$var$getTabbableCandidates(toastNode)
            ];
            return tabbingDirection === 'forwards' ? toastTabbableCandidates : toastTabbableCandidates.reverse();
        });
        return (tabbingDirection === 'forwards' ? tabbableCandidates.reverse() : tabbableCandidates).flat();
    }, [
        getItems
    ]);
    $eyrYI$useEffect(()=>{
        const viewport = ref.current; // We programmatically manage tabbing as we are unable to influence
        // the source order with portals, this allows us to reverse the
        // tab order so that it runs from most recent toast to least
        if (viewport) {
            const handleKeyDown = (event)=>{
                const isMetaKey = event.altKey || event.ctrlKey || event.metaKey;
                const isTabKey = event.key === 'Tab' && !isMetaKey;
                if (isTabKey) {
                    const focusedElement = document.activeElement;
                    const isTabbingBackwards = event.shiftKey;
                    const targetIsViewport = event.target === viewport; // If we're back tabbing after jumping to the viewport then we simply
                    // proxy focus out to the preceding document
                    if (targetIsViewport && isTabbingBackwards) {
                        var _headFocusProxyRef$cu;
                        (_headFocusProxyRef$cu = headFocusProxyRef.current) === null || _headFocusProxyRef$cu === void 0 || _headFocusProxyRef$cu.focus();
                        return;
                    }
                    const tabbingDirection = isTabbingBackwards ? 'backwards' : 'forwards';
                    const sortedCandidates = getSortedTabbableCandidates({
                        tabbingDirection: tabbingDirection
                    });
                    const index = sortedCandidates.findIndex((candidate)=>candidate === focusedElement
                    );
                    if ($054eb8030ebde76e$var$focusFirst(sortedCandidates.slice(index + 1))) event.preventDefault();
                    else {
                        var _headFocusProxyRef$cu2, _tailFocusProxyRef$cu;
                        // If we can't focus that means we're at the edges so we
                        // proxy to the corresponding exit point and let the browser handle
                        // tab/shift+tab keypress and implicitly pass focus to the next valid element in the document
                        isTabbingBackwards ? (_headFocusProxyRef$cu2 = headFocusProxyRef.current) === null || _headFocusProxyRef$cu2 === void 0 || _headFocusProxyRef$cu2.focus() : (_tailFocusProxyRef$cu = tailFocusProxyRef.current) === null || _tailFocusProxyRef$cu === void 0 || _tailFocusProxyRef$cu.focus();
                    }
                }
            }; // Toasts are not in the viewport React tree so we need to bind DOM events
            viewport.addEventListener('keydown', handleKeyDown);
            return ()=>viewport.removeEventListener('keydown', handleKeyDown)
            ;
        }
    }, [
        getItems,
        getSortedTabbableCandidates
    ]);
    return /*#__PURE__*/ $eyrYI$createElement($eyrYI$Branch, {
        ref: wrapperRef,
        role: "region",
        "aria-label": label.replace('{hotkey}', hotkeyLabel) // Ensure virtual cursor from landmarks menus triggers focus/blur for pause/resume
        ,
        tabIndex: -1 // incase list has size when empty (e.g. padding), we remove pointer events so
        ,
        style: {
            pointerEvents: hasToasts ? undefined : 'none'
        }
    }, hasToasts && /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$FocusProxy, {
        ref: headFocusProxyRef,
        onFocusFromOutsideViewport: ()=>{
            const tabbableCandidates = getSortedTabbableCandidates({
                tabbingDirection: 'forwards'
            });
            $054eb8030ebde76e$var$focusFirst(tabbableCandidates);
        }
    }), /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$Collection.Slot, {
        scope: __scopeToast
    }, /*#__PURE__*/ $eyrYI$createElement($eyrYI$Primitive.ol, $eyrYI$babelruntimehelpersesmextends({
        tabIndex: -1
    }, viewportProps, {
        ref: composedRefs
    }))), hasToasts && /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$FocusProxy, {
        ref: tailFocusProxyRef,
        onFocusFromOutsideViewport: ()=>{
            const tabbableCandidates = getSortedTabbableCandidates({
                tabbingDirection: 'backwards'
            });
            $054eb8030ebde76e$var$focusFirst(tabbableCandidates);
        }
    }));
});
/*#__PURE__*/ Object.assign($054eb8030ebde76e$export$6192c2425ecfd989, {
    displayName: $054eb8030ebde76e$var$VIEWPORT_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$FOCUS_PROXY_NAME = 'ToastFocusProxy';
const $054eb8030ebde76e$var$FocusProxy = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , onFocusFromOutsideViewport: onFocusFromOutsideViewport , ...proxyProps } = props;
    const context = $054eb8030ebde76e$var$useToastProviderContext($054eb8030ebde76e$var$FOCUS_PROXY_NAME, __scopeToast);
    return /*#__PURE__*/ $eyrYI$createElement($eyrYI$VisuallyHidden, $eyrYI$babelruntimehelpersesmextends({
        "aria-hidden": true,
        tabIndex: 0
    }, proxyProps, {
        ref: forwardedRef // Avoid page scrolling when focus is on the focus proxy
        ,
        style: {
            position: 'fixed'
        },
        onFocus: (event)=>{
            var _context$viewport;
            const prevFocusedElement = event.relatedTarget;
            const isFocusFromOutsideViewport = !((_context$viewport = context.viewport) !== null && _context$viewport !== void 0 && _context$viewport.contains(prevFocusedElement));
            if (isFocusFromOutsideViewport) onFocusFromOutsideViewport();
        }
    }));
});
/*#__PURE__*/ Object.assign($054eb8030ebde76e$var$FocusProxy, {
    displayName: $054eb8030ebde76e$var$FOCUS_PROXY_NAME
});
/* -------------------------------------------------------------------------------------------------
 * Toast
 * -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$TOAST_NAME = 'Toast';
const $054eb8030ebde76e$var$TOAST_SWIPE_START = 'toast.swipeStart';
const $054eb8030ebde76e$var$TOAST_SWIPE_MOVE = 'toast.swipeMove';
const $054eb8030ebde76e$var$TOAST_SWIPE_CANCEL = 'toast.swipeCancel';
const $054eb8030ebde76e$var$TOAST_SWIPE_END = 'toast.swipeEnd';
const $054eb8030ebde76e$export$8d8dc7d5f743331b = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { forceMount: forceMount , open: openProp , defaultOpen: defaultOpen , onOpenChange: onOpenChange , ...toastProps } = props;
    const [open = true, setOpen] = $eyrYI$useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    return /*#__PURE__*/ $eyrYI$createElement($eyrYI$Presence, {
        present: forceMount || open
    }, /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$ToastImpl, $eyrYI$babelruntimehelpersesmextends({
        open: open
    }, toastProps, {
        ref: forwardedRef,
        onClose: ()=>setOpen(false)
        ,
        onPause: $eyrYI$useCallbackRef(props.onPause),
        onResume: $eyrYI$useCallbackRef(props.onResume),
        onSwipeStart: $eyrYI$composeEventHandlers(props.onSwipeStart, (event)=>{
            event.currentTarget.setAttribute('data-swipe', 'start');
        }),
        onSwipeMove: $eyrYI$composeEventHandlers(props.onSwipeMove, (event)=>{
            const { x: x , y: y  } = event.detail.delta;
            event.currentTarget.setAttribute('data-swipe', 'move');
            event.currentTarget.style.setProperty('--radix-toast-swipe-move-x', `${x}px`);
            event.currentTarget.style.setProperty('--radix-toast-swipe-move-y', `${y}px`);
        }),
        onSwipeCancel: $eyrYI$composeEventHandlers(props.onSwipeCancel, (event)=>{
            event.currentTarget.setAttribute('data-swipe', 'cancel');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-x');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-y');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-end-x');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-end-y');
        }),
        onSwipeEnd: $eyrYI$composeEventHandlers(props.onSwipeEnd, (event)=>{
            const { x: x , y: y  } = event.detail.delta;
            event.currentTarget.setAttribute('data-swipe', 'end');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-x');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-y');
            event.currentTarget.style.setProperty('--radix-toast-swipe-end-x', `${x}px`);
            event.currentTarget.style.setProperty('--radix-toast-swipe-end-y', `${y}px`);
            setOpen(false);
        })
    })));
});
/*#__PURE__*/ Object.assign($054eb8030ebde76e$export$8d8dc7d5f743331b, {
    displayName: $054eb8030ebde76e$var$TOAST_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const [$054eb8030ebde76e$var$ToastInteractiveProvider, $054eb8030ebde76e$var$useToastInteractiveContext] = $054eb8030ebde76e$var$createToastContext($054eb8030ebde76e$var$TOAST_NAME, {
    onClose () {}
});
const $054eb8030ebde76e$var$ToastImpl = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , type: type = 'foreground' , duration: durationProp , open: open , onClose: onClose , onEscapeKeyDown: onEscapeKeyDown , onPause: onPause , onResume: onResume , onSwipeStart: onSwipeStart , onSwipeMove: onSwipeMove , onSwipeCancel: onSwipeCancel , onSwipeEnd: onSwipeEnd , ...toastProps } = props;
    const context = $054eb8030ebde76e$var$useToastProviderContext($054eb8030ebde76e$var$TOAST_NAME, __scopeToast);
    const [node1, setNode] = $eyrYI$useState(null);
    const composedRefs = $eyrYI$useComposedRefs(forwardedRef, (node)=>setNode(node)
    );
    const pointerStartRef = $eyrYI$useRef(null);
    const swipeDeltaRef = $eyrYI$useRef(null);
    const duration1 = durationProp || context.duration;
    const closeTimerStartTimeRef = $eyrYI$useRef(0);
    const closeTimerRemainingTimeRef = $eyrYI$useRef(duration1);
    const closeTimerRef = $eyrYI$useRef(0);
    const { onToastAdd: onToastAdd , onToastRemove: onToastRemove  } = context;
    const handleClose = $eyrYI$useCallbackRef(()=>{
        var _context$viewport2;
        // focus viewport if focus is within toast to read the remaining toast
        // count to SR users and ensure focus isn't lost
        const isFocusInToast = node1 === null || node1 === void 0 ? void 0 : node1.contains(document.activeElement);
        if (isFocusInToast) (_context$viewport2 = context.viewport) === null || _context$viewport2 === void 0 || _context$viewport2.focus();
        onClose();
    });
    const startTimer = $eyrYI$useCallback((duration)=>{
        if (!duration || duration === Infinity) return;
        window.clearTimeout(closeTimerRef.current);
        closeTimerStartTimeRef.current = new Date().getTime();
        closeTimerRef.current = window.setTimeout(handleClose, duration);
    }, [
        handleClose
    ]);
    $eyrYI$useEffect(()=>{
        const viewport = context.viewport;
        if (viewport) {
            const handleResume = ()=>{
                startTimer(closeTimerRemainingTimeRef.current);
                onResume === null || onResume === void 0 || onResume();
            };
            const handlePause = ()=>{
                const elapsedTime = new Date().getTime() - closeTimerStartTimeRef.current;
                closeTimerRemainingTimeRef.current = closeTimerRemainingTimeRef.current - elapsedTime;
                window.clearTimeout(closeTimerRef.current);
                onPause === null || onPause === void 0 || onPause();
            };
            viewport.addEventListener($054eb8030ebde76e$var$VIEWPORT_PAUSE, handlePause);
            viewport.addEventListener($054eb8030ebde76e$var$VIEWPORT_RESUME, handleResume);
            return ()=>{
                viewport.removeEventListener($054eb8030ebde76e$var$VIEWPORT_PAUSE, handlePause);
                viewport.removeEventListener($054eb8030ebde76e$var$VIEWPORT_RESUME, handleResume);
            };
        }
    }, [
        context.viewport,
        duration1,
        onPause,
        onResume,
        startTimer
    ]); // start timer when toast opens or duration changes.
    // we include `open` in deps because closed !== unmounted when animating
    // so it could reopen before being completely unmounted
    $eyrYI$useEffect(()=>{
        if (open && !context.isClosePausedRef.current) startTimer(duration1);
    }, [
        open,
        duration1,
        context.isClosePausedRef,
        startTimer
    ]);
    $eyrYI$useEffect(()=>{
        onToastAdd();
        return ()=>onToastRemove()
        ;
    }, [
        onToastAdd,
        onToastRemove
    ]);
    const announceTextContent = $eyrYI$useMemo(()=>{
        return node1 ? $054eb8030ebde76e$var$getAnnounceTextContent(node1) : null;
    }, [
        node1
    ]);
    if (!context.viewport) return null;
    return /*#__PURE__*/ $eyrYI$createElement($eyrYI$Fragment, null, announceTextContent && /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$ToastAnnounce, {
        __scopeToast: __scopeToast // Toasts are always role=status to avoid stuttering issues with role=alert in SRs.
        ,
        role: "status",
        "aria-live": type === 'foreground' ? 'assertive' : 'polite',
        "aria-atomic": true
    }, announceTextContent), /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$ToastInteractiveProvider, {
        scope: __scopeToast,
        onClose: handleClose
    }, /*#__PURE__*/ $eyrYI$createPortal(/*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$Collection.ItemSlot, {
        scope: __scopeToast
    }, /*#__PURE__*/ $eyrYI$createElement($eyrYI$Root, {
        asChild: true,
        onEscapeKeyDown: $eyrYI$composeEventHandlers(onEscapeKeyDown, ()=>{
            if (!context.isFocusedToastEscapeKeyDownRef.current) handleClose();
            context.isFocusedToastEscapeKeyDownRef.current = false;
        })
    }, /*#__PURE__*/ $eyrYI$createElement($eyrYI$Primitive.li, $eyrYI$babelruntimehelpersesmextends({
        // Ensure toasts are announced as status list or status when focused
        role: "status",
        "aria-live": "off",
        "aria-atomic": true,
        tabIndex: 0,
        "data-state": open ? 'open' : 'closed',
        "data-swipe-direction": context.swipeDirection
    }, toastProps, {
        ref: composedRefs,
        style: {
            userSelect: 'none',
            touchAction: 'none',
            ...props.style
        },
        onKeyDown: $eyrYI$composeEventHandlers(props.onKeyDown, (event)=>{
            if (event.key !== 'Escape') return;
            onEscapeKeyDown === null || onEscapeKeyDown === void 0 || onEscapeKeyDown(event.nativeEvent);
            if (!event.nativeEvent.defaultPrevented) {
                context.isFocusedToastEscapeKeyDownRef.current = true;
                handleClose();
            }
        }),
        onPointerDown: $eyrYI$composeEventHandlers(props.onPointerDown, (event)=>{
            if (event.button !== 0) return;
            pointerStartRef.current = {
                x: event.clientX,
                y: event.clientY
            };
        }),
        onPointerMove: $eyrYI$composeEventHandlers(props.onPointerMove, (event)=>{
            if (!pointerStartRef.current) return;
            const x = event.clientX - pointerStartRef.current.x;
            const y = event.clientY - pointerStartRef.current.y;
            const hasSwipeMoveStarted = Boolean(swipeDeltaRef.current);
            const isHorizontalSwipe = [
                'left',
                'right'
            ].includes(context.swipeDirection);
            const clamp = [
                'left',
                'up'
            ].includes(context.swipeDirection) ? Math.min : Math.max;
            const clampedX = isHorizontalSwipe ? clamp(0, x) : 0;
            const clampedY = !isHorizontalSwipe ? clamp(0, y) : 0;
            const moveStartBuffer = event.pointerType === 'touch' ? 10 : 2;
            const delta = {
                x: clampedX,
                y: clampedY
            };
            const eventDetail = {
                originalEvent: event,
                delta: delta
            };
            if (hasSwipeMoveStarted) {
                swipeDeltaRef.current = delta;
                $054eb8030ebde76e$var$handleAndDispatchCustomEvent($054eb8030ebde76e$var$TOAST_SWIPE_MOVE, onSwipeMove, eventDetail, {
                    discrete: false
                });
            } else if ($054eb8030ebde76e$var$isDeltaInDirection(delta, context.swipeDirection, moveStartBuffer)) {
                swipeDeltaRef.current = delta;
                $054eb8030ebde76e$var$handleAndDispatchCustomEvent($054eb8030ebde76e$var$TOAST_SWIPE_START, onSwipeStart, eventDetail, {
                    discrete: false
                });
                event.target.setPointerCapture(event.pointerId);
            } else if (Math.abs(x) > moveStartBuffer || Math.abs(y) > moveStartBuffer) // User is swiping in wrong direction so we disable swipe gesture
            // for the current pointer down interaction
            pointerStartRef.current = null;
        }),
        onPointerUp: $eyrYI$composeEventHandlers(props.onPointerUp, (event1)=>{
            const delta = swipeDeltaRef.current;
            const target = event1.target;
            if (target.hasPointerCapture(event1.pointerId)) target.releasePointerCapture(event1.pointerId);
            swipeDeltaRef.current = null;
            pointerStartRef.current = null;
            if (delta) {
                const toast = event1.currentTarget;
                const eventDetail = {
                    originalEvent: event1,
                    delta: delta
                };
                if ($054eb8030ebde76e$var$isDeltaInDirection(delta, context.swipeDirection, context.swipeThreshold)) $054eb8030ebde76e$var$handleAndDispatchCustomEvent($054eb8030ebde76e$var$TOAST_SWIPE_END, onSwipeEnd, eventDetail, {
                    discrete: true
                });
                else $054eb8030ebde76e$var$handleAndDispatchCustomEvent($054eb8030ebde76e$var$TOAST_SWIPE_CANCEL, onSwipeCancel, eventDetail, {
                    discrete: true
                });
                 // Prevent click event from triggering on items within the toast when
                // pointer up is part of a swipe gesture
                toast.addEventListener('click', (event)=>event.preventDefault()
                , {
                    once: true
                });
            }
        })
    })))), context.viewport)));
});
$054eb8030ebde76e$var$ToastImpl.propTypes = {
    type (props) {
        if (props.type && ![
            'foreground',
            'background'
        ].includes(props.type)) {
            const error = `Invalid prop \`type\` supplied to \`${$054eb8030ebde76e$var$TOAST_NAME}\`. Expected \`foreground | background\`.`;
            return new Error(error);
        }
        return null;
    }
};
/* -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$ToastAnnounce = (props)=>{
    const { __scopeToast: __scopeToast , children: children , ...announceProps } = props;
    const context = $054eb8030ebde76e$var$useToastProviderContext($054eb8030ebde76e$var$TOAST_NAME, __scopeToast);
    const [renderAnnounceText, setRenderAnnounceText] = $eyrYI$useState(false);
    const [isAnnounced, setIsAnnounced] = $eyrYI$useState(false); // render text content in the next frame to ensure toast is announced in NVDA
    $054eb8030ebde76e$var$useNextFrame(()=>setRenderAnnounceText(true)
    ); // cleanup after announcing
    $eyrYI$useEffect(()=>{
        const timer = window.setTimeout(()=>setIsAnnounced(true)
        , 1000);
        return ()=>window.clearTimeout(timer)
        ;
    }, []);
    return isAnnounced ? null : /*#__PURE__*/ $eyrYI$createElement($eyrYI$Portal, {
        asChild: true
    }, /*#__PURE__*/ $eyrYI$createElement($eyrYI$VisuallyHidden, announceProps, renderAnnounceText && /*#__PURE__*/ $eyrYI$createElement($eyrYI$Fragment, null, context.label, " ", children)));
};
/* -------------------------------------------------------------------------------------------------
 * ToastTitle
 * -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$TITLE_NAME = 'ToastTitle';
const $054eb8030ebde76e$export$16d42d7c29b95a4 = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , ...titleProps } = props;
    return /*#__PURE__*/ $eyrYI$createElement($eyrYI$Primitive.div, $eyrYI$babelruntimehelpersesmextends({}, titleProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($054eb8030ebde76e$export$16d42d7c29b95a4, {
    displayName: $054eb8030ebde76e$var$TITLE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * ToastDescription
 * -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$DESCRIPTION_NAME = 'ToastDescription';
const $054eb8030ebde76e$export$ecddd96c53621d9a = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , ...descriptionProps } = props;
    return /*#__PURE__*/ $eyrYI$createElement($eyrYI$Primitive.div, $eyrYI$babelruntimehelpersesmextends({}, descriptionProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($054eb8030ebde76e$export$ecddd96c53621d9a, {
    displayName: $054eb8030ebde76e$var$DESCRIPTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * ToastAction
 * -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$ACTION_NAME = 'ToastAction';
const $054eb8030ebde76e$export$3019feecfda683d2 = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { altText: altText , ...actionProps } = props;
    if (!altText) return null;
    return /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$ToastAnnounceExclude, {
        altText: altText,
        asChild: true
    }, /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$export$811e70f61c205839, $eyrYI$babelruntimehelpersesmextends({}, actionProps, {
        ref: forwardedRef
    })));
});
$054eb8030ebde76e$export$3019feecfda683d2.propTypes = {
    altText (props) {
        if (!props.altText) return new Error(`Missing prop \`altText\` expected on \`${$054eb8030ebde76e$var$ACTION_NAME}\``);
        return null;
    }
};
/*#__PURE__*/ Object.assign($054eb8030ebde76e$export$3019feecfda683d2, {
    displayName: $054eb8030ebde76e$var$ACTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * ToastClose
 * -----------------------------------------------------------------------------------------------*/ const $054eb8030ebde76e$var$CLOSE_NAME = 'ToastClose';
const $054eb8030ebde76e$export$811e70f61c205839 = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , ...closeProps } = props;
    const interactiveContext = $054eb8030ebde76e$var$useToastInteractiveContext($054eb8030ebde76e$var$CLOSE_NAME, __scopeToast);
    return /*#__PURE__*/ $eyrYI$createElement($054eb8030ebde76e$var$ToastAnnounceExclude, {
        asChild: true
    }, /*#__PURE__*/ $eyrYI$createElement($eyrYI$Primitive.button, $eyrYI$babelruntimehelpersesmextends({
        type: "button"
    }, closeProps, {
        ref: forwardedRef,
        onClick: $eyrYI$composeEventHandlers(props.onClick, interactiveContext.onClose)
    })));
});
/*#__PURE__*/ Object.assign($054eb8030ebde76e$export$811e70f61c205839, {
    displayName: $054eb8030ebde76e$var$CLOSE_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $054eb8030ebde76e$var$ToastAnnounceExclude = /*#__PURE__*/ $eyrYI$forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , altText: altText , ...announceExcludeProps } = props;
    return /*#__PURE__*/ $eyrYI$createElement($eyrYI$Primitive.div, $eyrYI$babelruntimehelpersesmextends({
        "data-radix-toast-announce-exclude": "",
        "data-radix-toast-announce-alt": altText || undefined
    }, announceExcludeProps, {
        ref: forwardedRef
    }));
});
function $054eb8030ebde76e$var$getAnnounceTextContent(container) {
    const textContent = [];
    const childNodes = Array.from(container.childNodes);
    childNodes.forEach((node)=>{
        if (node.nodeType === node.TEXT_NODE && node.textContent) textContent.push(node.textContent);
        if ($054eb8030ebde76e$var$isHTMLElement(node)) {
            const isHidden = node.ariaHidden || node.hidden || node.style.display === 'none';
            const isExcluded = node.dataset.radixToastAnnounceExclude === '';
            if (!isHidden) {
                if (isExcluded) {
                    const altText = node.dataset.radixToastAnnounceAlt;
                    if (altText) textContent.push(altText);
                } else textContent.push(...$054eb8030ebde76e$var$getAnnounceTextContent(node));
            }
        }
    }); // We return a collection of text rather than a single concatenated string.
    // This allows SR VO to naturally pause break between nodes while announcing.
    return textContent;
}
/* ---------------------------------------------------------------------------------------------- */ function $054eb8030ebde76e$var$handleAndDispatchCustomEvent(name, handler, detail, { discrete: discrete  }) {
    const currentTarget = detail.originalEvent.currentTarget;
    const event = new CustomEvent(name, {
        bubbles: true,
        cancelable: true,
        detail: detail
    });
    if (handler) currentTarget.addEventListener(name, handler, {
        once: true
    });
    if (discrete) $eyrYI$dispatchDiscreteCustomEvent(currentTarget, event);
    else currentTarget.dispatchEvent(event);
}
const $054eb8030ebde76e$var$isDeltaInDirection = (delta, direction, threshold = 0)=>{
    const deltaX = Math.abs(delta.x);
    const deltaY = Math.abs(delta.y);
    const isDeltaX = deltaX > deltaY;
    if (direction === 'left' || direction === 'right') return isDeltaX && deltaX > threshold;
    else return !isDeltaX && deltaY > threshold;
};
function $054eb8030ebde76e$var$useNextFrame(callback = ()=>{}) {
    const fn = $eyrYI$useCallbackRef(callback);
    $eyrYI$useLayoutEffect(()=>{
        let raf1 = 0;
        let raf2 = 0;
        raf1 = window.requestAnimationFrame(()=>raf2 = window.requestAnimationFrame(fn)
        );
        return ()=>{
            window.cancelAnimationFrame(raf1);
            window.cancelAnimationFrame(raf2);
        };
    }, [
        fn
    ]);
}
function $054eb8030ebde76e$var$isHTMLElement(node) {
    return node.nodeType === node.ELEMENT_NODE;
}
/**
 * Returns a list of potential tabbable candidates.
 *
 * NOTE: This is only a close approximation. For example it doesn't take into account cases like when
 * elements are not visible. This cannot be worked out easily by just reading a property, but rather
 * necessitate runtime knowledge (computed styles, etc). We deal with these cases separately.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
 * Credit: https://github.com/discord/focus-layers/blob/master/src/util/wrapFocus.tsx#L1
 */ function $054eb8030ebde76e$var$getTabbableCandidates(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node)=>{
            const isHiddenInput = node.tagName === 'INPUT' && node.type === 'hidden';
            if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP; // `.tabIndex` is not the same as the `tabindex` attribute. It works on the
            // runtime's understanding of tabbability, so this automatically accounts
            // for any kind of element that could be tabbed to.
            return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
    });
    while(walker.nextNode())nodes.push(walker.currentNode); // we do not take into account the order of nodes with positive `tabIndex` as it
    // hinders accessibility to have tab order different from visual order.
    return nodes;
}
function $054eb8030ebde76e$var$focusFirst(candidates) {
    const previouslyFocusedElement = document.activeElement;
    return candidates.some((candidate)=>{
        // if focus is already where we want to go, we don't want to keep going through the candidates
        if (candidate === previouslyFocusedElement) return true;
        candidate.focus();
        return document.activeElement !== previouslyFocusedElement;
    });
}
const $054eb8030ebde76e$export$2881499e37b75b9a = $054eb8030ebde76e$export$f5d03d415824e0e;
const $054eb8030ebde76e$export$d5c6c08dc2d3ca7 = $054eb8030ebde76e$export$6192c2425ecfd989;
const $054eb8030ebde76e$export$be92b6f5f03c0fe9 = $054eb8030ebde76e$export$8d8dc7d5f743331b;
const $054eb8030ebde76e$export$f99233281efd08a0 = $054eb8030ebde76e$export$16d42d7c29b95a4;
const $054eb8030ebde76e$export$393edc798c47379d = $054eb8030ebde76e$export$ecddd96c53621d9a;
const $054eb8030ebde76e$export$e19cd5f9376f8cee = $054eb8030ebde76e$export$3019feecfda683d2;
const $054eb8030ebde76e$export$f39c2d165cd861fe = $054eb8030ebde76e$export$811e70f61c205839;




export {$054eb8030ebde76e$export$8a359da18fbc9073 as createToastScope, $054eb8030ebde76e$export$f5d03d415824e0e as ToastProvider, $054eb8030ebde76e$export$6192c2425ecfd989 as ToastViewport, $054eb8030ebde76e$export$8d8dc7d5f743331b as Toast, $054eb8030ebde76e$export$16d42d7c29b95a4 as ToastTitle, $054eb8030ebde76e$export$ecddd96c53621d9a as ToastDescription, $054eb8030ebde76e$export$3019feecfda683d2 as ToastAction, $054eb8030ebde76e$export$811e70f61c205839 as ToastClose, $054eb8030ebde76e$export$2881499e37b75b9a as Provider, $054eb8030ebde76e$export$d5c6c08dc2d3ca7 as Viewport, $054eb8030ebde76e$export$be92b6f5f03c0fe9 as Root, $054eb8030ebde76e$export$f99233281efd08a0 as Title, $054eb8030ebde76e$export$393edc798c47379d as Description, $054eb8030ebde76e$export$e19cd5f9376f8cee as Action, $054eb8030ebde76e$export$f39c2d165cd861fe as Close};
//# sourceMappingURL=index.mjs.map
