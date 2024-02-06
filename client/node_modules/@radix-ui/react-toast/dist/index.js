var $iTyic$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $iTyic$react = require("react");
var $iTyic$reactdom = require("react-dom");
var $iTyic$radixuiprimitive = require("@radix-ui/primitive");
var $iTyic$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $iTyic$radixuireactcollection = require("@radix-ui/react-collection");
var $iTyic$radixuireactcontext = require("@radix-ui/react-context");
var $iTyic$radixuireactdismissablelayer = require("@radix-ui/react-dismissable-layer");
var $iTyic$radixuireactportal = require("@radix-ui/react-portal");
var $iTyic$radixuireactpresence = require("@radix-ui/react-presence");
var $iTyic$radixuireactprimitive = require("@radix-ui/react-primitive");
var $iTyic$radixuireactusecallbackref = require("@radix-ui/react-use-callback-ref");
var $iTyic$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $iTyic$radixuireactuselayouteffect = require("@radix-ui/react-use-layout-effect");
var $iTyic$radixuireactvisuallyhidden = require("@radix-ui/react-visually-hidden");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createToastScope", () => $9208a85b3e79d33f$export$8a359da18fbc9073);
$parcel$export(module.exports, "ToastProvider", () => $9208a85b3e79d33f$export$f5d03d415824e0e);
$parcel$export(module.exports, "ToastViewport", () => $9208a85b3e79d33f$export$6192c2425ecfd989);
$parcel$export(module.exports, "Toast", () => $9208a85b3e79d33f$export$8d8dc7d5f743331b);
$parcel$export(module.exports, "ToastTitle", () => $9208a85b3e79d33f$export$16d42d7c29b95a4);
$parcel$export(module.exports, "ToastDescription", () => $9208a85b3e79d33f$export$ecddd96c53621d9a);
$parcel$export(module.exports, "ToastAction", () => $9208a85b3e79d33f$export$3019feecfda683d2);
$parcel$export(module.exports, "ToastClose", () => $9208a85b3e79d33f$export$811e70f61c205839);
$parcel$export(module.exports, "Provider", () => $9208a85b3e79d33f$export$2881499e37b75b9a);
$parcel$export(module.exports, "Viewport", () => $9208a85b3e79d33f$export$d5c6c08dc2d3ca7);
$parcel$export(module.exports, "Root", () => $9208a85b3e79d33f$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Title", () => $9208a85b3e79d33f$export$f99233281efd08a0);
$parcel$export(module.exports, "Description", () => $9208a85b3e79d33f$export$393edc798c47379d);
$parcel$export(module.exports, "Action", () => $9208a85b3e79d33f$export$e19cd5f9376f8cee);
$parcel$export(module.exports, "Close", () => $9208a85b3e79d33f$export$f39c2d165cd861fe);















/* -------------------------------------------------------------------------------------------------
 * ToastProvider
 * -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$PROVIDER_NAME = 'ToastProvider';
const [$9208a85b3e79d33f$var$Collection, $9208a85b3e79d33f$var$useCollection, $9208a85b3e79d33f$var$createCollectionScope] = $iTyic$radixuireactcollection.createCollection('Toast');
const [$9208a85b3e79d33f$var$createToastContext, $9208a85b3e79d33f$export$8a359da18fbc9073] = $iTyic$radixuireactcontext.createContextScope('Toast', [
    $9208a85b3e79d33f$var$createCollectionScope
]);
const [$9208a85b3e79d33f$var$ToastProviderProvider, $9208a85b3e79d33f$var$useToastProviderContext] = $9208a85b3e79d33f$var$createToastContext($9208a85b3e79d33f$var$PROVIDER_NAME);
const $9208a85b3e79d33f$export$f5d03d415824e0e = (props)=>{
    const { __scopeToast: __scopeToast , label: label = 'Notification' , duration: duration = 5000 , swipeDirection: swipeDirection = 'right' , swipeThreshold: swipeThreshold = 50 , children: children  } = props;
    const [viewport, setViewport] = $iTyic$react.useState(null);
    const [toastCount, setToastCount] = $iTyic$react.useState(0);
    const isFocusedToastEscapeKeyDownRef = $iTyic$react.useRef(false);
    const isClosePausedRef = $iTyic$react.useRef(false);
    return /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$Collection.Provider, {
        scope: __scopeToast
    }, /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$ToastProviderProvider, {
        scope: __scopeToast,
        label: label,
        duration: duration,
        swipeDirection: swipeDirection,
        swipeThreshold: swipeThreshold,
        toastCount: toastCount,
        viewport: viewport,
        onViewportChange: setViewport,
        onToastAdd: $iTyic$react.useCallback(()=>setToastCount((prevCount)=>prevCount + 1
            )
        , []),
        onToastRemove: $iTyic$react.useCallback(()=>setToastCount((prevCount)=>prevCount - 1
            )
        , []),
        isFocusedToastEscapeKeyDownRef: isFocusedToastEscapeKeyDownRef,
        isClosePausedRef: isClosePausedRef
    }, children));
};
$9208a85b3e79d33f$export$f5d03d415824e0e.propTypes = {
    label (props) {
        if (props.label && typeof props.label === 'string' && !props.label.trim()) {
            const error = `Invalid prop \`label\` supplied to \`${$9208a85b3e79d33f$var$PROVIDER_NAME}\`. Expected non-empty \`string\`.`;
            return new Error(error);
        }
        return null;
    }
};
/*#__PURE__*/ Object.assign($9208a85b3e79d33f$export$f5d03d415824e0e, {
    displayName: $9208a85b3e79d33f$var$PROVIDER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * ToastViewport
 * -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$VIEWPORT_NAME = 'ToastViewport';
const $9208a85b3e79d33f$var$VIEWPORT_DEFAULT_HOTKEY = [
    'F8'
];
const $9208a85b3e79d33f$var$VIEWPORT_PAUSE = 'toast.viewportPause';
const $9208a85b3e79d33f$var$VIEWPORT_RESUME = 'toast.viewportResume';
const $9208a85b3e79d33f$export$6192c2425ecfd989 = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , hotkey: hotkey = $9208a85b3e79d33f$var$VIEWPORT_DEFAULT_HOTKEY , label: label = 'Notifications ({hotkey})' , ...viewportProps } = props;
    const context = $9208a85b3e79d33f$var$useToastProviderContext($9208a85b3e79d33f$var$VIEWPORT_NAME, __scopeToast);
    const getItems = $9208a85b3e79d33f$var$useCollection(__scopeToast);
    const wrapperRef = $iTyic$react.useRef(null);
    const headFocusProxyRef = $iTyic$react.useRef(null);
    const tailFocusProxyRef = $iTyic$react.useRef(null);
    const ref = $iTyic$react.useRef(null);
    const composedRefs = $iTyic$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref, context.onViewportChange);
    const hotkeyLabel = hotkey.join('+').replace(/Key/g, '').replace(/Digit/g, '');
    const hasToasts = context.toastCount > 0;
    $iTyic$react.useEffect(()=>{
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
    $iTyic$react.useEffect(()=>{
        const wrapper = wrapperRef.current;
        const viewport = ref.current;
        if (hasToasts && wrapper && viewport) {
            const handlePause = ()=>{
                if (!context.isClosePausedRef.current) {
                    const pauseEvent = new CustomEvent($9208a85b3e79d33f$var$VIEWPORT_PAUSE);
                    viewport.dispatchEvent(pauseEvent);
                    context.isClosePausedRef.current = true;
                }
            };
            const handleResume = ()=>{
                if (context.isClosePausedRef.current) {
                    const resumeEvent = new CustomEvent($9208a85b3e79d33f$var$VIEWPORT_RESUME);
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
    const getSortedTabbableCandidates = $iTyic$react.useCallback(({ tabbingDirection: tabbingDirection  })=>{
        const toastItems = getItems();
        const tabbableCandidates = toastItems.map((toastItem)=>{
            const toastNode = toastItem.ref.current;
            const toastTabbableCandidates = [
                toastNode,
                ...$9208a85b3e79d33f$var$getTabbableCandidates(toastNode)
            ];
            return tabbingDirection === 'forwards' ? toastTabbableCandidates : toastTabbableCandidates.reverse();
        });
        return (tabbingDirection === 'forwards' ? tabbableCandidates.reverse() : tabbableCandidates).flat();
    }, [
        getItems
    ]);
    $iTyic$react.useEffect(()=>{
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
                    if ($9208a85b3e79d33f$var$focusFirst(sortedCandidates.slice(index + 1))) event.preventDefault();
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
    return /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactdismissablelayer.Branch, {
        ref: wrapperRef,
        role: "region",
        "aria-label": label.replace('{hotkey}', hotkeyLabel) // Ensure virtual cursor from landmarks menus triggers focus/blur for pause/resume
        ,
        tabIndex: -1 // incase list has size when empty (e.g. padding), we remove pointer events so
        ,
        style: {
            pointerEvents: hasToasts ? undefined : 'none'
        }
    }, hasToasts && /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$FocusProxy, {
        ref: headFocusProxyRef,
        onFocusFromOutsideViewport: ()=>{
            const tabbableCandidates = getSortedTabbableCandidates({
                tabbingDirection: 'forwards'
            });
            $9208a85b3e79d33f$var$focusFirst(tabbableCandidates);
        }
    }), /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$Collection.Slot, {
        scope: __scopeToast
    }, /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactprimitive.Primitive.ol, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({
        tabIndex: -1
    }, viewportProps, {
        ref: composedRefs
    }))), hasToasts && /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$FocusProxy, {
        ref: tailFocusProxyRef,
        onFocusFromOutsideViewport: ()=>{
            const tabbableCandidates = getSortedTabbableCandidates({
                tabbingDirection: 'backwards'
            });
            $9208a85b3e79d33f$var$focusFirst(tabbableCandidates);
        }
    }));
});
/*#__PURE__*/ Object.assign($9208a85b3e79d33f$export$6192c2425ecfd989, {
    displayName: $9208a85b3e79d33f$var$VIEWPORT_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$FOCUS_PROXY_NAME = 'ToastFocusProxy';
const $9208a85b3e79d33f$var$FocusProxy = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , onFocusFromOutsideViewport: onFocusFromOutsideViewport , ...proxyProps } = props;
    const context = $9208a85b3e79d33f$var$useToastProviderContext($9208a85b3e79d33f$var$FOCUS_PROXY_NAME, __scopeToast);
    return /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactvisuallyhidden.VisuallyHidden, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({
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
/*#__PURE__*/ Object.assign($9208a85b3e79d33f$var$FocusProxy, {
    displayName: $9208a85b3e79d33f$var$FOCUS_PROXY_NAME
});
/* -------------------------------------------------------------------------------------------------
 * Toast
 * -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$TOAST_NAME = 'Toast';
const $9208a85b3e79d33f$var$TOAST_SWIPE_START = 'toast.swipeStart';
const $9208a85b3e79d33f$var$TOAST_SWIPE_MOVE = 'toast.swipeMove';
const $9208a85b3e79d33f$var$TOAST_SWIPE_CANCEL = 'toast.swipeCancel';
const $9208a85b3e79d33f$var$TOAST_SWIPE_END = 'toast.swipeEnd';
const $9208a85b3e79d33f$export$8d8dc7d5f743331b = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { forceMount: forceMount , open: openProp , defaultOpen: defaultOpen , onOpenChange: onOpenChange , ...toastProps } = props;
    const [open = true, setOpen] = $iTyic$radixuireactusecontrollablestate.useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    return /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactpresence.Presence, {
        present: forceMount || open
    }, /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$ToastImpl, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({
        open: open
    }, toastProps, {
        ref: forwardedRef,
        onClose: ()=>setOpen(false)
        ,
        onPause: $iTyic$radixuireactusecallbackref.useCallbackRef(props.onPause),
        onResume: $iTyic$radixuireactusecallbackref.useCallbackRef(props.onResume),
        onSwipeStart: $iTyic$radixuiprimitive.composeEventHandlers(props.onSwipeStart, (event)=>{
            event.currentTarget.setAttribute('data-swipe', 'start');
        }),
        onSwipeMove: $iTyic$radixuiprimitive.composeEventHandlers(props.onSwipeMove, (event)=>{
            const { x: x , y: y  } = event.detail.delta;
            event.currentTarget.setAttribute('data-swipe', 'move');
            event.currentTarget.style.setProperty('--radix-toast-swipe-move-x', `${x}px`);
            event.currentTarget.style.setProperty('--radix-toast-swipe-move-y', `${y}px`);
        }),
        onSwipeCancel: $iTyic$radixuiprimitive.composeEventHandlers(props.onSwipeCancel, (event)=>{
            event.currentTarget.setAttribute('data-swipe', 'cancel');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-x');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-y');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-end-x');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-end-y');
        }),
        onSwipeEnd: $iTyic$radixuiprimitive.composeEventHandlers(props.onSwipeEnd, (event)=>{
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
/*#__PURE__*/ Object.assign($9208a85b3e79d33f$export$8d8dc7d5f743331b, {
    displayName: $9208a85b3e79d33f$var$TOAST_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const [$9208a85b3e79d33f$var$ToastInteractiveProvider, $9208a85b3e79d33f$var$useToastInteractiveContext] = $9208a85b3e79d33f$var$createToastContext($9208a85b3e79d33f$var$TOAST_NAME, {
    onClose () {}
});
const $9208a85b3e79d33f$var$ToastImpl = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , type: type = 'foreground' , duration: durationProp , open: open , onClose: onClose , onEscapeKeyDown: onEscapeKeyDown , onPause: onPause , onResume: onResume , onSwipeStart: onSwipeStart , onSwipeMove: onSwipeMove , onSwipeCancel: onSwipeCancel , onSwipeEnd: onSwipeEnd , ...toastProps } = props;
    const context = $9208a85b3e79d33f$var$useToastProviderContext($9208a85b3e79d33f$var$TOAST_NAME, __scopeToast);
    const [node1, setNode] = $iTyic$react.useState(null);
    const composedRefs = $iTyic$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setNode(node)
    );
    const pointerStartRef = $iTyic$react.useRef(null);
    const swipeDeltaRef = $iTyic$react.useRef(null);
    const duration1 = durationProp || context.duration;
    const closeTimerStartTimeRef = $iTyic$react.useRef(0);
    const closeTimerRemainingTimeRef = $iTyic$react.useRef(duration1);
    const closeTimerRef = $iTyic$react.useRef(0);
    const { onToastAdd: onToastAdd , onToastRemove: onToastRemove  } = context;
    const handleClose = $iTyic$radixuireactusecallbackref.useCallbackRef(()=>{
        var _context$viewport2;
        // focus viewport if focus is within toast to read the remaining toast
        // count to SR users and ensure focus isn't lost
        const isFocusInToast = node1 === null || node1 === void 0 ? void 0 : node1.contains(document.activeElement);
        if (isFocusInToast) (_context$viewport2 = context.viewport) === null || _context$viewport2 === void 0 || _context$viewport2.focus();
        onClose();
    });
    const startTimer = $iTyic$react.useCallback((duration)=>{
        if (!duration || duration === Infinity) return;
        window.clearTimeout(closeTimerRef.current);
        closeTimerStartTimeRef.current = new Date().getTime();
        closeTimerRef.current = window.setTimeout(handleClose, duration);
    }, [
        handleClose
    ]);
    $iTyic$react.useEffect(()=>{
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
            viewport.addEventListener($9208a85b3e79d33f$var$VIEWPORT_PAUSE, handlePause);
            viewport.addEventListener($9208a85b3e79d33f$var$VIEWPORT_RESUME, handleResume);
            return ()=>{
                viewport.removeEventListener($9208a85b3e79d33f$var$VIEWPORT_PAUSE, handlePause);
                viewport.removeEventListener($9208a85b3e79d33f$var$VIEWPORT_RESUME, handleResume);
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
    $iTyic$react.useEffect(()=>{
        if (open && !context.isClosePausedRef.current) startTimer(duration1);
    }, [
        open,
        duration1,
        context.isClosePausedRef,
        startTimer
    ]);
    $iTyic$react.useEffect(()=>{
        onToastAdd();
        return ()=>onToastRemove()
        ;
    }, [
        onToastAdd,
        onToastRemove
    ]);
    const announceTextContent = $iTyic$react.useMemo(()=>{
        return node1 ? $9208a85b3e79d33f$var$getAnnounceTextContent(node1) : null;
    }, [
        node1
    ]);
    if (!context.viewport) return null;
    return /*#__PURE__*/ $iTyic$react.createElement($iTyic$react.Fragment, null, announceTextContent && /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$ToastAnnounce, {
        __scopeToast: __scopeToast // Toasts are always role=status to avoid stuttering issues with role=alert in SRs.
        ,
        role: "status",
        "aria-live": type === 'foreground' ? 'assertive' : 'polite',
        "aria-atomic": true
    }, announceTextContent), /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$ToastInteractiveProvider, {
        scope: __scopeToast,
        onClose: handleClose
    }, /*#__PURE__*/ $iTyic$reactdom.createPortal(/*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$Collection.ItemSlot, {
        scope: __scopeToast
    }, /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactdismissablelayer.Root, {
        asChild: true,
        onEscapeKeyDown: $iTyic$radixuiprimitive.composeEventHandlers(onEscapeKeyDown, ()=>{
            if (!context.isFocusedToastEscapeKeyDownRef.current) handleClose();
            context.isFocusedToastEscapeKeyDownRef.current = false;
        })
    }, /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactprimitive.Primitive.li, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({
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
        onKeyDown: $iTyic$radixuiprimitive.composeEventHandlers(props.onKeyDown, (event)=>{
            if (event.key !== 'Escape') return;
            onEscapeKeyDown === null || onEscapeKeyDown === void 0 || onEscapeKeyDown(event.nativeEvent);
            if (!event.nativeEvent.defaultPrevented) {
                context.isFocusedToastEscapeKeyDownRef.current = true;
                handleClose();
            }
        }),
        onPointerDown: $iTyic$radixuiprimitive.composeEventHandlers(props.onPointerDown, (event)=>{
            if (event.button !== 0) return;
            pointerStartRef.current = {
                x: event.clientX,
                y: event.clientY
            };
        }),
        onPointerMove: $iTyic$radixuiprimitive.composeEventHandlers(props.onPointerMove, (event)=>{
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
                $9208a85b3e79d33f$var$handleAndDispatchCustomEvent($9208a85b3e79d33f$var$TOAST_SWIPE_MOVE, onSwipeMove, eventDetail, {
                    discrete: false
                });
            } else if ($9208a85b3e79d33f$var$isDeltaInDirection(delta, context.swipeDirection, moveStartBuffer)) {
                swipeDeltaRef.current = delta;
                $9208a85b3e79d33f$var$handleAndDispatchCustomEvent($9208a85b3e79d33f$var$TOAST_SWIPE_START, onSwipeStart, eventDetail, {
                    discrete: false
                });
                event.target.setPointerCapture(event.pointerId);
            } else if (Math.abs(x) > moveStartBuffer || Math.abs(y) > moveStartBuffer) // User is swiping in wrong direction so we disable swipe gesture
            // for the current pointer down interaction
            pointerStartRef.current = null;
        }),
        onPointerUp: $iTyic$radixuiprimitive.composeEventHandlers(props.onPointerUp, (event1)=>{
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
                if ($9208a85b3e79d33f$var$isDeltaInDirection(delta, context.swipeDirection, context.swipeThreshold)) $9208a85b3e79d33f$var$handleAndDispatchCustomEvent($9208a85b3e79d33f$var$TOAST_SWIPE_END, onSwipeEnd, eventDetail, {
                    discrete: true
                });
                else $9208a85b3e79d33f$var$handleAndDispatchCustomEvent($9208a85b3e79d33f$var$TOAST_SWIPE_CANCEL, onSwipeCancel, eventDetail, {
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
$9208a85b3e79d33f$var$ToastImpl.propTypes = {
    type (props) {
        if (props.type && ![
            'foreground',
            'background'
        ].includes(props.type)) {
            const error = `Invalid prop \`type\` supplied to \`${$9208a85b3e79d33f$var$TOAST_NAME}\`. Expected \`foreground | background\`.`;
            return new Error(error);
        }
        return null;
    }
};
/* -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$ToastAnnounce = (props)=>{
    const { __scopeToast: __scopeToast , children: children , ...announceProps } = props;
    const context = $9208a85b3e79d33f$var$useToastProviderContext($9208a85b3e79d33f$var$TOAST_NAME, __scopeToast);
    const [renderAnnounceText, setRenderAnnounceText] = $iTyic$react.useState(false);
    const [isAnnounced, setIsAnnounced] = $iTyic$react.useState(false); // render text content in the next frame to ensure toast is announced in NVDA
    $9208a85b3e79d33f$var$useNextFrame(()=>setRenderAnnounceText(true)
    ); // cleanup after announcing
    $iTyic$react.useEffect(()=>{
        const timer = window.setTimeout(()=>setIsAnnounced(true)
        , 1000);
        return ()=>window.clearTimeout(timer)
        ;
    }, []);
    return isAnnounced ? null : /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactportal.Portal, {
        asChild: true
    }, /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactvisuallyhidden.VisuallyHidden, announceProps, renderAnnounceText && /*#__PURE__*/ $iTyic$react.createElement($iTyic$react.Fragment, null, context.label, " ", children)));
};
/* -------------------------------------------------------------------------------------------------
 * ToastTitle
 * -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$TITLE_NAME = 'ToastTitle';
const $9208a85b3e79d33f$export$16d42d7c29b95a4 = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , ...titleProps } = props;
    return /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({}, titleProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($9208a85b3e79d33f$export$16d42d7c29b95a4, {
    displayName: $9208a85b3e79d33f$var$TITLE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * ToastDescription
 * -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$DESCRIPTION_NAME = 'ToastDescription';
const $9208a85b3e79d33f$export$ecddd96c53621d9a = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , ...descriptionProps } = props;
    return /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({}, descriptionProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($9208a85b3e79d33f$export$ecddd96c53621d9a, {
    displayName: $9208a85b3e79d33f$var$DESCRIPTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * ToastAction
 * -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$ACTION_NAME = 'ToastAction';
const $9208a85b3e79d33f$export$3019feecfda683d2 = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { altText: altText , ...actionProps } = props;
    if (!altText) return null;
    return /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$ToastAnnounceExclude, {
        altText: altText,
        asChild: true
    }, /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$export$811e70f61c205839, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({}, actionProps, {
        ref: forwardedRef
    })));
});
$9208a85b3e79d33f$export$3019feecfda683d2.propTypes = {
    altText (props) {
        if (!props.altText) return new Error(`Missing prop \`altText\` expected on \`${$9208a85b3e79d33f$var$ACTION_NAME}\``);
        return null;
    }
};
/*#__PURE__*/ Object.assign($9208a85b3e79d33f$export$3019feecfda683d2, {
    displayName: $9208a85b3e79d33f$var$ACTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * ToastClose
 * -----------------------------------------------------------------------------------------------*/ const $9208a85b3e79d33f$var$CLOSE_NAME = 'ToastClose';
const $9208a85b3e79d33f$export$811e70f61c205839 = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , ...closeProps } = props;
    const interactiveContext = $9208a85b3e79d33f$var$useToastInteractiveContext($9208a85b3e79d33f$var$CLOSE_NAME, __scopeToast);
    return /*#__PURE__*/ $iTyic$react.createElement($9208a85b3e79d33f$var$ToastAnnounceExclude, {
        asChild: true
    }, /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({
        type: "button"
    }, closeProps, {
        ref: forwardedRef,
        onClick: $iTyic$radixuiprimitive.composeEventHandlers(props.onClick, interactiveContext.onClose)
    })));
});
/*#__PURE__*/ Object.assign($9208a85b3e79d33f$export$811e70f61c205839, {
    displayName: $9208a85b3e79d33f$var$CLOSE_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $9208a85b3e79d33f$var$ToastAnnounceExclude = /*#__PURE__*/ $iTyic$react.forwardRef((props, forwardedRef)=>{
    const { __scopeToast: __scopeToast , altText: altText , ...announceExcludeProps } = props;
    return /*#__PURE__*/ $iTyic$react.createElement($iTyic$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($iTyic$babelruntimehelpersextends))({
        "data-radix-toast-announce-exclude": "",
        "data-radix-toast-announce-alt": altText || undefined
    }, announceExcludeProps, {
        ref: forwardedRef
    }));
});
function $9208a85b3e79d33f$var$getAnnounceTextContent(container) {
    const textContent = [];
    const childNodes = Array.from(container.childNodes);
    childNodes.forEach((node)=>{
        if (node.nodeType === node.TEXT_NODE && node.textContent) textContent.push(node.textContent);
        if ($9208a85b3e79d33f$var$isHTMLElement(node)) {
            const isHidden = node.ariaHidden || node.hidden || node.style.display === 'none';
            const isExcluded = node.dataset.radixToastAnnounceExclude === '';
            if (!isHidden) {
                if (isExcluded) {
                    const altText = node.dataset.radixToastAnnounceAlt;
                    if (altText) textContent.push(altText);
                } else textContent.push(...$9208a85b3e79d33f$var$getAnnounceTextContent(node));
            }
        }
    }); // We return a collection of text rather than a single concatenated string.
    // This allows SR VO to naturally pause break between nodes while announcing.
    return textContent;
}
/* ---------------------------------------------------------------------------------------------- */ function $9208a85b3e79d33f$var$handleAndDispatchCustomEvent(name, handler, detail, { discrete: discrete  }) {
    const currentTarget = detail.originalEvent.currentTarget;
    const event = new CustomEvent(name, {
        bubbles: true,
        cancelable: true,
        detail: detail
    });
    if (handler) currentTarget.addEventListener(name, handler, {
        once: true
    });
    if (discrete) $iTyic$radixuireactprimitive.dispatchDiscreteCustomEvent(currentTarget, event);
    else currentTarget.dispatchEvent(event);
}
const $9208a85b3e79d33f$var$isDeltaInDirection = (delta, direction, threshold = 0)=>{
    const deltaX = Math.abs(delta.x);
    const deltaY = Math.abs(delta.y);
    const isDeltaX = deltaX > deltaY;
    if (direction === 'left' || direction === 'right') return isDeltaX && deltaX > threshold;
    else return !isDeltaX && deltaY > threshold;
};
function $9208a85b3e79d33f$var$useNextFrame(callback = ()=>{}) {
    const fn = $iTyic$radixuireactusecallbackref.useCallbackRef(callback);
    $iTyic$radixuireactuselayouteffect.useLayoutEffect(()=>{
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
function $9208a85b3e79d33f$var$isHTMLElement(node) {
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
 */ function $9208a85b3e79d33f$var$getTabbableCandidates(container) {
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
function $9208a85b3e79d33f$var$focusFirst(candidates) {
    const previouslyFocusedElement = document.activeElement;
    return candidates.some((candidate)=>{
        // if focus is already where we want to go, we don't want to keep going through the candidates
        if (candidate === previouslyFocusedElement) return true;
        candidate.focus();
        return document.activeElement !== previouslyFocusedElement;
    });
}
const $9208a85b3e79d33f$export$2881499e37b75b9a = $9208a85b3e79d33f$export$f5d03d415824e0e;
const $9208a85b3e79d33f$export$d5c6c08dc2d3ca7 = $9208a85b3e79d33f$export$6192c2425ecfd989;
const $9208a85b3e79d33f$export$be92b6f5f03c0fe9 = $9208a85b3e79d33f$export$8d8dc7d5f743331b;
const $9208a85b3e79d33f$export$f99233281efd08a0 = $9208a85b3e79d33f$export$16d42d7c29b95a4;
const $9208a85b3e79d33f$export$393edc798c47379d = $9208a85b3e79d33f$export$ecddd96c53621d9a;
const $9208a85b3e79d33f$export$e19cd5f9376f8cee = $9208a85b3e79d33f$export$3019feecfda683d2;
const $9208a85b3e79d33f$export$f39c2d165cd861fe = $9208a85b3e79d33f$export$811e70f61c205839;




//# sourceMappingURL=index.js.map
