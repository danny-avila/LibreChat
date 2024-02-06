var $cnSS2$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $cnSS2$react = require("react");
var $cnSS2$radixuiprimitive = require("@radix-ui/primitive");
var $cnSS2$radixuireactcollection = require("@radix-ui/react-collection");
var $cnSS2$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $cnSS2$radixuireactcontext = require("@radix-ui/react-context");
var $cnSS2$radixuireactdirection = require("@radix-ui/react-direction");
var $cnSS2$radixuireactdismissablelayer = require("@radix-ui/react-dismissable-layer");
var $cnSS2$radixuireactfocusguards = require("@radix-ui/react-focus-guards");
var $cnSS2$radixuireactfocusscope = require("@radix-ui/react-focus-scope");
var $cnSS2$radixuireactid = require("@radix-ui/react-id");
var $cnSS2$radixuireactpopper = require("@radix-ui/react-popper");
var $cnSS2$radixuireactportal = require("@radix-ui/react-portal");
var $cnSS2$radixuireactpresence = require("@radix-ui/react-presence");
var $cnSS2$radixuireactprimitive = require("@radix-ui/react-primitive");
var $cnSS2$radixuireactrovingfocus = require("@radix-ui/react-roving-focus");
var $cnSS2$radixuireactslot = require("@radix-ui/react-slot");
var $cnSS2$radixuireactusecallbackref = require("@radix-ui/react-use-callback-ref");
var $cnSS2$ariahidden = require("aria-hidden");
var $cnSS2$reactremovescroll = require("react-remove-scroll");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createMenuScope", () => $213e4d2df823067d$export$4027731b685e72eb);
$parcel$export(module.exports, "Menu", () => $213e4d2df823067d$export$d9b273488cd8ce6f);
$parcel$export(module.exports, "MenuAnchor", () => $213e4d2df823067d$export$9fa5ebd18bee4d43);
$parcel$export(module.exports, "MenuPortal", () => $213e4d2df823067d$export$793392f970497feb);
$parcel$export(module.exports, "MenuContent", () => $213e4d2df823067d$export$479f0f2f71193efe);
$parcel$export(module.exports, "MenuGroup", () => $213e4d2df823067d$export$22a631d1f72787bb);
$parcel$export(module.exports, "MenuLabel", () => $213e4d2df823067d$export$dd37bec0e8a99143);
$parcel$export(module.exports, "MenuItem", () => $213e4d2df823067d$export$2ce376c2cc3355c8);
$parcel$export(module.exports, "MenuCheckboxItem", () => $213e4d2df823067d$export$f6f243521332502d);
$parcel$export(module.exports, "MenuRadioGroup", () => $213e4d2df823067d$export$ea2200c9eee416b3);
$parcel$export(module.exports, "MenuRadioItem", () => $213e4d2df823067d$export$69bd225e9817f6d0);
$parcel$export(module.exports, "MenuItemIndicator", () => $213e4d2df823067d$export$a2593e23056970a3);
$parcel$export(module.exports, "MenuSeparator", () => $213e4d2df823067d$export$1cec7dcdd713e220);
$parcel$export(module.exports, "MenuArrow", () => $213e4d2df823067d$export$bcdda4773debf5fa);
$parcel$export(module.exports, "MenuSub", () => $213e4d2df823067d$export$71bdb9d1e2909932);
$parcel$export(module.exports, "MenuSubTrigger", () => $213e4d2df823067d$export$5fbbb3ba7297405f);
$parcel$export(module.exports, "MenuSubContent", () => $213e4d2df823067d$export$e7142ab31822bde6);
$parcel$export(module.exports, "Root", () => $213e4d2df823067d$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Anchor", () => $213e4d2df823067d$export$b688253958b8dfe7);
$parcel$export(module.exports, "Portal", () => $213e4d2df823067d$export$602eac185826482c);
$parcel$export(module.exports, "Content", () => $213e4d2df823067d$export$7c6e2c02157bb7d2);
$parcel$export(module.exports, "Group", () => $213e4d2df823067d$export$eb2fcfdbd7ba97d4);
$parcel$export(module.exports, "Label", () => $213e4d2df823067d$export$b04be29aa201d4f5);
$parcel$export(module.exports, "Item", () => $213e4d2df823067d$export$6d08773d2e66f8f2);
$parcel$export(module.exports, "CheckboxItem", () => $213e4d2df823067d$export$16ce288f89fa631c);
$parcel$export(module.exports, "RadioGroup", () => $213e4d2df823067d$export$a98f0dcb43a68a25);
$parcel$export(module.exports, "RadioItem", () => $213e4d2df823067d$export$371ab307eab489c0);
$parcel$export(module.exports, "ItemIndicator", () => $213e4d2df823067d$export$c3468e2714d175fa);
$parcel$export(module.exports, "Separator", () => $213e4d2df823067d$export$1ff3c3f08ae963c0);
$parcel$export(module.exports, "Arrow", () => $213e4d2df823067d$export$21b07c8f274aebd5);
$parcel$export(module.exports, "Sub", () => $213e4d2df823067d$export$d7a01e11500dfb6f);
$parcel$export(module.exports, "SubTrigger", () => $213e4d2df823067d$export$2ea8a7a591ac5eac);
$parcel$export(module.exports, "SubContent", () => $213e4d2df823067d$export$6d4de93b380beddf);






















const $213e4d2df823067d$var$SELECTION_KEYS = [
    'Enter',
    ' '
];
const $213e4d2df823067d$var$FIRST_KEYS = [
    'ArrowDown',
    'PageUp',
    'Home'
];
const $213e4d2df823067d$var$LAST_KEYS = [
    'ArrowUp',
    'PageDown',
    'End'
];
const $213e4d2df823067d$var$FIRST_LAST_KEYS = [
    ...$213e4d2df823067d$var$FIRST_KEYS,
    ...$213e4d2df823067d$var$LAST_KEYS
];
const $213e4d2df823067d$var$SUB_OPEN_KEYS = {
    ltr: [
        ...$213e4d2df823067d$var$SELECTION_KEYS,
        'ArrowRight'
    ],
    rtl: [
        ...$213e4d2df823067d$var$SELECTION_KEYS,
        'ArrowLeft'
    ]
};
const $213e4d2df823067d$var$SUB_CLOSE_KEYS = {
    ltr: [
        'ArrowLeft'
    ],
    rtl: [
        'ArrowRight'
    ]
};
/* -------------------------------------------------------------------------------------------------
 * Menu
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$MENU_NAME = 'Menu';
const [$213e4d2df823067d$var$Collection, $213e4d2df823067d$var$useCollection, $213e4d2df823067d$var$createCollectionScope] = $cnSS2$radixuireactcollection.createCollection($213e4d2df823067d$var$MENU_NAME);
const [$213e4d2df823067d$var$createMenuContext, $213e4d2df823067d$export$4027731b685e72eb] = $cnSS2$radixuireactcontext.createContextScope($213e4d2df823067d$var$MENU_NAME, [
    $213e4d2df823067d$var$createCollectionScope,
    $cnSS2$radixuireactpopper.createPopperScope,
    $cnSS2$radixuireactrovingfocus.createRovingFocusGroupScope
]);
const $213e4d2df823067d$var$usePopperScope = $cnSS2$radixuireactpopper.createPopperScope();
const $213e4d2df823067d$var$useRovingFocusGroupScope = $cnSS2$radixuireactrovingfocus.createRovingFocusGroupScope();
const [$213e4d2df823067d$var$MenuProvider, $213e4d2df823067d$var$useMenuContext] = $213e4d2df823067d$var$createMenuContext($213e4d2df823067d$var$MENU_NAME);
const [$213e4d2df823067d$var$MenuRootProvider, $213e4d2df823067d$var$useMenuRootContext] = $213e4d2df823067d$var$createMenuContext($213e4d2df823067d$var$MENU_NAME);
const $213e4d2df823067d$export$d9b273488cd8ce6f = (props)=>{
    const { __scopeMenu: __scopeMenu , open: open = false , children: children , dir: dir , onOpenChange: onOpenChange , modal: modal = true  } = props;
    const popperScope = $213e4d2df823067d$var$usePopperScope(__scopeMenu);
    const [content, setContent] = $cnSS2$react.useState(null);
    const isUsingKeyboardRef = $cnSS2$react.useRef(false);
    const handleOpenChange = $cnSS2$radixuireactusecallbackref.useCallbackRef(onOpenChange);
    const direction = $cnSS2$radixuireactdirection.useDirection(dir);
    $cnSS2$react.useEffect(()=>{
        // Capture phase ensures we set the boolean before any side effects execute
        // in response to the key or pointer event as they might depend on this value.
        const handleKeyDown = ()=>{
            isUsingKeyboardRef.current = true;
            document.addEventListener('pointerdown', handlePointer, {
                capture: true,
                once: true
            });
            document.addEventListener('pointermove', handlePointer, {
                capture: true,
                once: true
            });
        };
        const handlePointer = ()=>isUsingKeyboardRef.current = false
        ;
        document.addEventListener('keydown', handleKeyDown, {
            capture: true
        });
        return ()=>{
            document.removeEventListener('keydown', handleKeyDown, {
                capture: true
            });
            document.removeEventListener('pointerdown', handlePointer, {
                capture: true
            });
            document.removeEventListener('pointermove', handlePointer, {
                capture: true
            });
        };
    }, []);
    return /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpopper.Root, popperScope, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuProvider, {
        scope: __scopeMenu,
        open: open,
        onOpenChange: handleOpenChange,
        content: content,
        onContentChange: setContent
    }, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuRootProvider, {
        scope: __scopeMenu,
        onClose: $cnSS2$react.useCallback(()=>handleOpenChange(false)
        , [
            handleOpenChange
        ]),
        isUsingKeyboardRef: isUsingKeyboardRef,
        dir: direction,
        modal: modal
    }, children)));
};
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$d9b273488cd8ce6f, {
    displayName: $213e4d2df823067d$var$MENU_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuAnchor
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$ANCHOR_NAME = 'MenuAnchor';
const $213e4d2df823067d$export$9fa5ebd18bee4d43 = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { __scopeMenu: __scopeMenu , ...anchorProps } = props;
    const popperScope = $213e4d2df823067d$var$usePopperScope(__scopeMenu);
    return /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpopper.Anchor, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, popperScope, anchorProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$9fa5ebd18bee4d43, {
    displayName: $213e4d2df823067d$var$ANCHOR_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuPortal
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$PORTAL_NAME = 'MenuPortal';
const [$213e4d2df823067d$var$PortalProvider, $213e4d2df823067d$var$usePortalContext] = $213e4d2df823067d$var$createMenuContext($213e4d2df823067d$var$PORTAL_NAME, {
    forceMount: undefined
});
const $213e4d2df823067d$export$793392f970497feb = (props)=>{
    const { __scopeMenu: __scopeMenu , forceMount: forceMount , children: children , container: container  } = props;
    const context = $213e4d2df823067d$var$useMenuContext($213e4d2df823067d$var$PORTAL_NAME, __scopeMenu);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$PortalProvider, {
        scope: __scopeMenu,
        forceMount: forceMount
    }, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactportal.Portal, {
        asChild: true,
        container: container
    }, children)));
};
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$793392f970497feb, {
    displayName: $213e4d2df823067d$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuContent
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$CONTENT_NAME = 'MenuContent';
const [$213e4d2df823067d$var$MenuContentProvider, $213e4d2df823067d$var$useMenuContentContext] = $213e4d2df823067d$var$createMenuContext($213e4d2df823067d$var$CONTENT_NAME);
const $213e4d2df823067d$export$479f0f2f71193efe = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const portalContext = $213e4d2df823067d$var$usePortalContext($213e4d2df823067d$var$CONTENT_NAME, props.__scopeMenu);
    const { forceMount: forceMount = portalContext.forceMount , ...contentProps } = props;
    const context = $213e4d2df823067d$var$useMenuContext($213e4d2df823067d$var$CONTENT_NAME, props.__scopeMenu);
    const rootContext = $213e4d2df823067d$var$useMenuRootContext($213e4d2df823067d$var$CONTENT_NAME, props.__scopeMenu);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$Collection.Provider, {
        scope: props.__scopeMenu
    }, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$Collection.Slot, {
        scope: props.__scopeMenu
    }, rootContext.modal ? /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuRootContentModal, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, contentProps, {
        ref: forwardedRef
    })) : /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuRootContentNonModal, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, contentProps, {
        ref: forwardedRef
    })))));
});
/* ---------------------------------------------------------------------------------------------- */ const $213e4d2df823067d$var$MenuRootContentModal = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const context = $213e4d2df823067d$var$useMenuContext($213e4d2df823067d$var$CONTENT_NAME, props.__scopeMenu);
    const ref = $cnSS2$react.useRef(null);
    const composedRefs = $cnSS2$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref); // Hide everything from ARIA except the `MenuContent`
    $cnSS2$react.useEffect(()=>{
        const content = ref.current;
        if (content) return $cnSS2$ariahidden.hideOthers(content);
    }, []);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuContentImpl, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, props, {
        ref: composedRefs // we make sure we're not trapping once it's been closed
        ,
        trapFocus: context.open // make sure to only disable pointer events when open
        ,
        disableOutsidePointerEvents: context.open,
        disableOutsideScroll: true // When focus is trapped, a `focusout` event may still happen.
        ,
        onFocusOutside: $cnSS2$radixuiprimitive.composeEventHandlers(props.onFocusOutside, (event)=>event.preventDefault()
        , {
            checkForDefaultPrevented: false
        }),
        onDismiss: ()=>context.onOpenChange(false)
    }));
});
const $213e4d2df823067d$var$MenuRootContentNonModal = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const context = $213e4d2df823067d$var$useMenuContext($213e4d2df823067d$var$CONTENT_NAME, props.__scopeMenu);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuContentImpl, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, props, {
        ref: forwardedRef,
        trapFocus: false,
        disableOutsidePointerEvents: false,
        disableOutsideScroll: false,
        onDismiss: ()=>context.onOpenChange(false)
    }));
});
/* ---------------------------------------------------------------------------------------------- */ const $213e4d2df823067d$var$MenuContentImpl = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { __scopeMenu: __scopeMenu , loop: loop = false , trapFocus: trapFocus , onOpenAutoFocus: onOpenAutoFocus , onCloseAutoFocus: onCloseAutoFocus , disableOutsidePointerEvents: disableOutsidePointerEvents , onEntryFocus: onEntryFocus , onEscapeKeyDown: onEscapeKeyDown , onPointerDownOutside: onPointerDownOutside , onFocusOutside: onFocusOutside , onInteractOutside: onInteractOutside , onDismiss: onDismiss , disableOutsideScroll: disableOutsideScroll , ...contentProps } = props;
    const context = $213e4d2df823067d$var$useMenuContext($213e4d2df823067d$var$CONTENT_NAME, __scopeMenu);
    const rootContext = $213e4d2df823067d$var$useMenuRootContext($213e4d2df823067d$var$CONTENT_NAME, __scopeMenu);
    const popperScope = $213e4d2df823067d$var$usePopperScope(__scopeMenu);
    const rovingFocusGroupScope = $213e4d2df823067d$var$useRovingFocusGroupScope(__scopeMenu);
    const getItems = $213e4d2df823067d$var$useCollection(__scopeMenu);
    const [currentItemId, setCurrentItemId] = $cnSS2$react.useState(null);
    const contentRef = $cnSS2$react.useRef(null);
    const composedRefs = $cnSS2$radixuireactcomposerefs.useComposedRefs(forwardedRef, contentRef, context.onContentChange);
    const timerRef = $cnSS2$react.useRef(0);
    const searchRef = $cnSS2$react.useRef('');
    const pointerGraceTimerRef = $cnSS2$react.useRef(0);
    const pointerGraceIntentRef = $cnSS2$react.useRef(null);
    const pointerDirRef = $cnSS2$react.useRef('right');
    const lastPointerXRef = $cnSS2$react.useRef(0);
    const ScrollLockWrapper = disableOutsideScroll ? $cnSS2$reactremovescroll.RemoveScroll : $cnSS2$react.Fragment;
    const scrollLockWrapperProps = disableOutsideScroll ? {
        as: $cnSS2$radixuireactslot.Slot,
        allowPinchZoom: true
    } : undefined;
    const handleTypeaheadSearch = (key)=>{
        var _items$find, _items$find2;
        const search = searchRef.current + key;
        const items = getItems().filter((item)=>!item.disabled
        );
        const currentItem = document.activeElement;
        const currentMatch = (_items$find = items.find((item)=>item.ref.current === currentItem
        )) === null || _items$find === void 0 ? void 0 : _items$find.textValue;
        const values = items.map((item)=>item.textValue
        );
        const nextMatch = $213e4d2df823067d$var$getNextMatch(values, search, currentMatch);
        const newItem = (_items$find2 = items.find((item)=>item.textValue === nextMatch
        )) === null || _items$find2 === void 0 ? void 0 : _items$find2.ref.current; // Reset `searchRef` 1 second after it was last updated
        (function updateSearch(value) {
            searchRef.current = value;
            window.clearTimeout(timerRef.current);
            if (value !== '') timerRef.current = window.setTimeout(()=>updateSearch('')
            , 1000);
        })(search);
        if (newItem) /**
       * Imperative focus during keydown is risky so we prevent React's batching updates
       * to avoid potential bugs. See: https://github.com/facebook/react/issues/20332
       */ setTimeout(()=>newItem.focus()
        );
    };
    $cnSS2$react.useEffect(()=>{
        return ()=>window.clearTimeout(timerRef.current)
        ;
    }, []); // Make sure the whole tree has focus guards as our `MenuContent` may be
    // the last element in the DOM (beacuse of the `Portal`)
    $cnSS2$radixuireactfocusguards.useFocusGuards();
    const isPointerMovingToSubmenu = $cnSS2$react.useCallback((event)=>{
        var _pointerGraceIntentRe, _pointerGraceIntentRe2;
        const isMovingTowards = pointerDirRef.current === ((_pointerGraceIntentRe = pointerGraceIntentRef.current) === null || _pointerGraceIntentRe === void 0 ? void 0 : _pointerGraceIntentRe.side);
        return isMovingTowards && $213e4d2df823067d$var$isPointerInGraceArea(event, (_pointerGraceIntentRe2 = pointerGraceIntentRef.current) === null || _pointerGraceIntentRe2 === void 0 ? void 0 : _pointerGraceIntentRe2.area);
    }, []);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuContentProvider, {
        scope: __scopeMenu,
        searchRef: searchRef,
        onItemEnter: $cnSS2$react.useCallback((event)=>{
            if (isPointerMovingToSubmenu(event)) event.preventDefault();
        }, [
            isPointerMovingToSubmenu
        ]),
        onItemLeave: $cnSS2$react.useCallback((event)=>{
            var _contentRef$current;
            if (isPointerMovingToSubmenu(event)) return;
            (_contentRef$current = contentRef.current) === null || _contentRef$current === void 0 || _contentRef$current.focus();
            setCurrentItemId(null);
        }, [
            isPointerMovingToSubmenu
        ]),
        onTriggerLeave: $cnSS2$react.useCallback((event)=>{
            if (isPointerMovingToSubmenu(event)) event.preventDefault();
        }, [
            isPointerMovingToSubmenu
        ]),
        pointerGraceTimerRef: pointerGraceTimerRef,
        onPointerGraceIntentChange: $cnSS2$react.useCallback((intent)=>{
            pointerGraceIntentRef.current = intent;
        }, [])
    }, /*#__PURE__*/ $cnSS2$react.createElement(ScrollLockWrapper, scrollLockWrapperProps, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactfocusscope.FocusScope, {
        asChild: true,
        trapped: trapFocus,
        onMountAutoFocus: $cnSS2$radixuiprimitive.composeEventHandlers(onOpenAutoFocus, (event)=>{
            var _contentRef$current2;
            // when opening, explicitly focus the content area only and leave
            // `onEntryFocus` in  control of focusing first item
            event.preventDefault();
            (_contentRef$current2 = contentRef.current) === null || _contentRef$current2 === void 0 || _contentRef$current2.focus();
        }),
        onUnmountAutoFocus: onCloseAutoFocus
    }, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactdismissablelayer.DismissableLayer, {
        asChild: true,
        disableOutsidePointerEvents: disableOutsidePointerEvents,
        onEscapeKeyDown: onEscapeKeyDown,
        onPointerDownOutside: onPointerDownOutside,
        onFocusOutside: onFocusOutside,
        onInteractOutside: onInteractOutside,
        onDismiss: onDismiss
    }, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactrovingfocus.Root, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        asChild: true
    }, rovingFocusGroupScope, {
        dir: rootContext.dir,
        orientation: "vertical",
        loop: loop,
        currentTabStopId: currentItemId,
        onCurrentTabStopIdChange: setCurrentItemId,
        onEntryFocus: $cnSS2$radixuiprimitive.composeEventHandlers(onEntryFocus, (event)=>{
            // only focus first item when using keyboard
            if (!rootContext.isUsingKeyboardRef.current) event.preventDefault();
        })
    }), /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpopper.Content, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        role: "menu",
        "aria-orientation": "vertical",
        "data-state": $213e4d2df823067d$var$getOpenState(context.open),
        "data-radix-menu-content": "",
        dir: rootContext.dir
    }, popperScope, contentProps, {
        ref: composedRefs,
        style: {
            outline: 'none',
            ...contentProps.style
        },
        onKeyDown: $cnSS2$radixuiprimitive.composeEventHandlers(contentProps.onKeyDown, (event)=>{
            // submenu key events bubble through portals. We only care about keys in this menu.
            const target = event.target;
            const isKeyDownInside = target.closest('[data-radix-menu-content]') === event.currentTarget;
            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
            const isCharacterKey = event.key.length === 1;
            if (isKeyDownInside) {
                // menus should not be navigated using tab key so we prevent it
                if (event.key === 'Tab') event.preventDefault();
                if (!isModifierKey && isCharacterKey) handleTypeaheadSearch(event.key);
            } // focus first/last item based on key pressed
            const content = contentRef.current;
            if (event.target !== content) return;
            if (!$213e4d2df823067d$var$FIRST_LAST_KEYS.includes(event.key)) return;
            event.preventDefault();
            const items = getItems().filter((item)=>!item.disabled
            );
            const candidateNodes = items.map((item)=>item.ref.current
            );
            if ($213e4d2df823067d$var$LAST_KEYS.includes(event.key)) candidateNodes.reverse();
            $213e4d2df823067d$var$focusFirst(candidateNodes);
        }),
        onBlur: $cnSS2$radixuiprimitive.composeEventHandlers(props.onBlur, (event)=>{
            // clear search buffer when leaving the menu
            if (!event.currentTarget.contains(event.target)) {
                window.clearTimeout(timerRef.current);
                searchRef.current = '';
            }
        }),
        onPointerMove: $cnSS2$radixuiprimitive.composeEventHandlers(props.onPointerMove, $213e4d2df823067d$var$whenMouse((event)=>{
            const target = event.target;
            const pointerXHasChanged = lastPointerXRef.current !== event.clientX; // We don't use `event.movementX` for this check because Safari will
            // always return `0` on a pointer event.
            if (event.currentTarget.contains(target) && pointerXHasChanged) {
                const newDir = event.clientX > lastPointerXRef.current ? 'right' : 'left';
                pointerDirRef.current = newDir;
                lastPointerXRef.current = event.clientX;
            }
        }))
    })))))));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$479f0f2f71193efe, {
    displayName: $213e4d2df823067d$var$CONTENT_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuGroup
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$GROUP_NAME = 'MenuGroup';
const $213e4d2df823067d$export$22a631d1f72787bb = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { __scopeMenu: __scopeMenu , ...groupProps } = props;
    return /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        role: "group"
    }, groupProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$22a631d1f72787bb, {
    displayName: $213e4d2df823067d$var$GROUP_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuLabel
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$LABEL_NAME = 'MenuLabel';
const $213e4d2df823067d$export$dd37bec0e8a99143 = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { __scopeMenu: __scopeMenu , ...labelProps } = props;
    return /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, labelProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$dd37bec0e8a99143, {
    displayName: $213e4d2df823067d$var$LABEL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuItem
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$ITEM_NAME = 'MenuItem';
const $213e4d2df823067d$var$ITEM_SELECT = 'menu.itemSelect';
const $213e4d2df823067d$export$2ce376c2cc3355c8 = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { disabled: disabled = false , onSelect: onSelect , ...itemProps } = props;
    const ref = $cnSS2$react.useRef(null);
    const rootContext = $213e4d2df823067d$var$useMenuRootContext($213e4d2df823067d$var$ITEM_NAME, props.__scopeMenu);
    const contentContext = $213e4d2df823067d$var$useMenuContentContext($213e4d2df823067d$var$ITEM_NAME, props.__scopeMenu);
    const composedRefs = $cnSS2$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref);
    const isPointerDownRef = $cnSS2$react.useRef(false);
    const handleSelect = ()=>{
        const menuItem = ref.current;
        if (!disabled && menuItem) {
            const itemSelectEvent = new CustomEvent($213e4d2df823067d$var$ITEM_SELECT, {
                bubbles: true,
                cancelable: true
            });
            menuItem.addEventListener($213e4d2df823067d$var$ITEM_SELECT, (event)=>onSelect === null || onSelect === void 0 ? void 0 : onSelect(event)
            , {
                once: true
            });
            $cnSS2$radixuireactprimitive.dispatchDiscreteCustomEvent(menuItem, itemSelectEvent);
            if (itemSelectEvent.defaultPrevented) isPointerDownRef.current = false;
            else rootContext.onClose();
        }
    };
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuItemImpl, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, itemProps, {
        ref: composedRefs,
        disabled: disabled,
        onClick: $cnSS2$radixuiprimitive.composeEventHandlers(props.onClick, handleSelect),
        onPointerDown: (event)=>{
            var _props$onPointerDown;
            (_props$onPointerDown = props.onPointerDown) === null || _props$onPointerDown === void 0 || _props$onPointerDown.call(props, event);
            isPointerDownRef.current = true;
        },
        onPointerUp: $cnSS2$radixuiprimitive.composeEventHandlers(props.onPointerUp, (event)=>{
            var _event$currentTarget;
            // Pointer down can move to a different menu item which should activate it on pointer up.
            // We dispatch a click for selection to allow composition with click based triggers and to
            // prevent Firefox from getting stuck in text selection mode when the menu closes.
            if (!isPointerDownRef.current) (_event$currentTarget = event.currentTarget) === null || _event$currentTarget === void 0 || _event$currentTarget.click();
        }),
        onKeyDown: $cnSS2$radixuiprimitive.composeEventHandlers(props.onKeyDown, (event)=>{
            const isTypingAhead = contentContext.searchRef.current !== '';
            if (disabled || isTypingAhead && event.key === ' ') return;
            if ($213e4d2df823067d$var$SELECTION_KEYS.includes(event.key)) {
                event.currentTarget.click();
                /**
         * We prevent default browser behaviour for selection keys as they should trigger
         * a selection only:
         * - prevents space from scrolling the page.
         * - if keydown causes focus to move, prevents keydown from firing on the new target.
         */ event.preventDefault();
            }
        })
    }));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$2ce376c2cc3355c8, {
    displayName: $213e4d2df823067d$var$ITEM_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $213e4d2df823067d$var$MenuItemImpl = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { __scopeMenu: __scopeMenu , disabled: disabled = false , textValue: textValue , ...itemProps } = props;
    const contentContext = $213e4d2df823067d$var$useMenuContentContext($213e4d2df823067d$var$ITEM_NAME, __scopeMenu);
    const rovingFocusGroupScope = $213e4d2df823067d$var$useRovingFocusGroupScope(__scopeMenu);
    const ref = $cnSS2$react.useRef(null);
    const composedRefs = $cnSS2$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref);
    const [isFocused, setIsFocused] = $cnSS2$react.useState(false); // get the item's `.textContent` as default strategy for typeahead `textValue`
    const [textContent, setTextContent] = $cnSS2$react.useState('');
    $cnSS2$react.useEffect(()=>{
        const menuItem = ref.current;
        if (menuItem) {
            var _menuItem$textContent;
            setTextContent(((_menuItem$textContent = menuItem.textContent) !== null && _menuItem$textContent !== void 0 ? _menuItem$textContent : '').trim());
        }
    }, [
        itemProps.children
    ]);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$Collection.ItemSlot, {
        scope: __scopeMenu,
        disabled: disabled,
        textValue: textValue !== null && textValue !== void 0 ? textValue : textContent
    }, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactrovingfocus.Item, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        asChild: true
    }, rovingFocusGroupScope, {
        focusable: !disabled
    }), /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        role: "menuitem",
        "data-highlighted": isFocused ? '' : undefined,
        "aria-disabled": disabled || undefined,
        "data-disabled": disabled ? '' : undefined
    }, itemProps, {
        ref: composedRefs,
        onPointerMove: $cnSS2$radixuiprimitive.composeEventHandlers(props.onPointerMove, $213e4d2df823067d$var$whenMouse((event)=>{
            if (disabled) contentContext.onItemLeave(event);
            else {
                contentContext.onItemEnter(event);
                if (!event.defaultPrevented) {
                    const item = event.currentTarget;
                    item.focus();
                }
            }
        })),
        onPointerLeave: $cnSS2$radixuiprimitive.composeEventHandlers(props.onPointerLeave, $213e4d2df823067d$var$whenMouse((event)=>contentContext.onItemLeave(event)
        )),
        onFocus: $cnSS2$radixuiprimitive.composeEventHandlers(props.onFocus, ()=>setIsFocused(true)
        ),
        onBlur: $cnSS2$radixuiprimitive.composeEventHandlers(props.onBlur, ()=>setIsFocused(false)
        )
    }))));
});
/* -------------------------------------------------------------------------------------------------
 * MenuCheckboxItem
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$CHECKBOX_ITEM_NAME = 'MenuCheckboxItem';
const $213e4d2df823067d$export$f6f243521332502d = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { checked: checked = false , onCheckedChange: onCheckedChange , ...checkboxItemProps } = props;
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$ItemIndicatorProvider, {
        scope: props.__scopeMenu,
        checked: checked
    }, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$export$2ce376c2cc3355c8, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        role: "menuitemcheckbox",
        "aria-checked": $213e4d2df823067d$var$isIndeterminate(checked) ? 'mixed' : checked
    }, checkboxItemProps, {
        ref: forwardedRef,
        "data-state": $213e4d2df823067d$var$getCheckedState(checked),
        onSelect: $cnSS2$radixuiprimitive.composeEventHandlers(checkboxItemProps.onSelect, ()=>onCheckedChange === null || onCheckedChange === void 0 ? void 0 : onCheckedChange($213e4d2df823067d$var$isIndeterminate(checked) ? true : !checked)
        , {
            checkForDefaultPrevented: false
        })
    })));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$f6f243521332502d, {
    displayName: $213e4d2df823067d$var$CHECKBOX_ITEM_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuRadioGroup
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$RADIO_GROUP_NAME = 'MenuRadioGroup';
const [$213e4d2df823067d$var$RadioGroupProvider, $213e4d2df823067d$var$useRadioGroupContext] = $213e4d2df823067d$var$createMenuContext($213e4d2df823067d$var$RADIO_GROUP_NAME, {
    value: undefined,
    onValueChange: ()=>{}
});
const $213e4d2df823067d$export$ea2200c9eee416b3 = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { value: value , onValueChange: onValueChange , ...groupProps } = props;
    const handleValueChange = $cnSS2$radixuireactusecallbackref.useCallbackRef(onValueChange);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$RadioGroupProvider, {
        scope: props.__scopeMenu,
        value: value,
        onValueChange: handleValueChange
    }, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$export$22a631d1f72787bb, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, groupProps, {
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$ea2200c9eee416b3, {
    displayName: $213e4d2df823067d$var$RADIO_GROUP_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuRadioItem
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$RADIO_ITEM_NAME = 'MenuRadioItem';
const $213e4d2df823067d$export$69bd225e9817f6d0 = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { value: value , ...radioItemProps } = props;
    const context = $213e4d2df823067d$var$useRadioGroupContext($213e4d2df823067d$var$RADIO_ITEM_NAME, props.__scopeMenu);
    const checked = value === context.value;
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$ItemIndicatorProvider, {
        scope: props.__scopeMenu,
        checked: checked
    }, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$export$2ce376c2cc3355c8, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        role: "menuitemradio",
        "aria-checked": checked
    }, radioItemProps, {
        ref: forwardedRef,
        "data-state": $213e4d2df823067d$var$getCheckedState(checked),
        onSelect: $cnSS2$radixuiprimitive.composeEventHandlers(radioItemProps.onSelect, ()=>{
            var _context$onValueChang;
            return (_context$onValueChang = context.onValueChange) === null || _context$onValueChang === void 0 ? void 0 : _context$onValueChang.call(context, value);
        }, {
            checkForDefaultPrevented: false
        })
    })));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$69bd225e9817f6d0, {
    displayName: $213e4d2df823067d$var$RADIO_ITEM_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuItemIndicator
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$ITEM_INDICATOR_NAME = 'MenuItemIndicator';
const [$213e4d2df823067d$var$ItemIndicatorProvider, $213e4d2df823067d$var$useItemIndicatorContext] = $213e4d2df823067d$var$createMenuContext($213e4d2df823067d$var$ITEM_INDICATOR_NAME, {
    checked: false
});
const $213e4d2df823067d$export$a2593e23056970a3 = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { __scopeMenu: __scopeMenu , forceMount: forceMount , ...itemIndicatorProps } = props;
    const indicatorContext = $213e4d2df823067d$var$useItemIndicatorContext($213e4d2df823067d$var$ITEM_INDICATOR_NAME, __scopeMenu);
    return /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpresence.Presence, {
        present: forceMount || $213e4d2df823067d$var$isIndeterminate(indicatorContext.checked) || indicatorContext.checked === true
    }, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactprimitive.Primitive.span, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, itemIndicatorProps, {
        ref: forwardedRef,
        "data-state": $213e4d2df823067d$var$getCheckedState(indicatorContext.checked)
    })));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$a2593e23056970a3, {
    displayName: $213e4d2df823067d$var$ITEM_INDICATOR_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuSeparator
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$SEPARATOR_NAME = 'MenuSeparator';
const $213e4d2df823067d$export$1cec7dcdd713e220 = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { __scopeMenu: __scopeMenu , ...separatorProps } = props;
    return /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        role: "separator",
        "aria-orientation": "horizontal"
    }, separatorProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$1cec7dcdd713e220, {
    displayName: $213e4d2df823067d$var$SEPARATOR_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuArrow
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$ARROW_NAME = 'MenuArrow';
const $213e4d2df823067d$export$bcdda4773debf5fa = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const { __scopeMenu: __scopeMenu , ...arrowProps } = props;
    const popperScope = $213e4d2df823067d$var$usePopperScope(__scopeMenu);
    return /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpopper.Arrow, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({}, popperScope, arrowProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$bcdda4773debf5fa, {
    displayName: $213e4d2df823067d$var$ARROW_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuSub
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$SUB_NAME = 'MenuSub';
const [$213e4d2df823067d$var$MenuSubProvider, $213e4d2df823067d$var$useMenuSubContext] = $213e4d2df823067d$var$createMenuContext($213e4d2df823067d$var$SUB_NAME);
const $213e4d2df823067d$export$71bdb9d1e2909932 = (props)=>{
    const { __scopeMenu: __scopeMenu , children: children , open: open = false , onOpenChange: onOpenChange  } = props;
    const parentMenuContext = $213e4d2df823067d$var$useMenuContext($213e4d2df823067d$var$SUB_NAME, __scopeMenu);
    const popperScope = $213e4d2df823067d$var$usePopperScope(__scopeMenu);
    const [trigger, setTrigger] = $cnSS2$react.useState(null);
    const [content, setContent] = $cnSS2$react.useState(null);
    const handleOpenChange = $cnSS2$radixuireactusecallbackref.useCallbackRef(onOpenChange); // Prevent the parent menu from reopening with open submenus.
    $cnSS2$react.useEffect(()=>{
        if (parentMenuContext.open === false) handleOpenChange(false);
        return ()=>handleOpenChange(false)
        ;
    }, [
        parentMenuContext.open,
        handleOpenChange
    ]);
    return /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpopper.Root, popperScope, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuProvider, {
        scope: __scopeMenu,
        open: open,
        onOpenChange: handleOpenChange,
        content: content,
        onContentChange: setContent
    }, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuSubProvider, {
        scope: __scopeMenu,
        contentId: $cnSS2$radixuireactid.useId(),
        triggerId: $cnSS2$radixuireactid.useId(),
        trigger: trigger,
        onTriggerChange: setTrigger
    }, children)));
};
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$71bdb9d1e2909932, {
    displayName: $213e4d2df823067d$var$SUB_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuSubTrigger
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$SUB_TRIGGER_NAME = 'MenuSubTrigger';
const $213e4d2df823067d$export$5fbbb3ba7297405f = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const context = $213e4d2df823067d$var$useMenuContext($213e4d2df823067d$var$SUB_TRIGGER_NAME, props.__scopeMenu);
    const rootContext = $213e4d2df823067d$var$useMenuRootContext($213e4d2df823067d$var$SUB_TRIGGER_NAME, props.__scopeMenu);
    const subContext = $213e4d2df823067d$var$useMenuSubContext($213e4d2df823067d$var$SUB_TRIGGER_NAME, props.__scopeMenu);
    const contentContext = $213e4d2df823067d$var$useMenuContentContext($213e4d2df823067d$var$SUB_TRIGGER_NAME, props.__scopeMenu);
    const openTimerRef = $cnSS2$react.useRef(null);
    const { pointerGraceTimerRef: pointerGraceTimerRef , onPointerGraceIntentChange: onPointerGraceIntentChange  } = contentContext;
    const scope = {
        __scopeMenu: props.__scopeMenu
    };
    const clearOpenTimer = $cnSS2$react.useCallback(()=>{
        if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
    }, []);
    $cnSS2$react.useEffect(()=>clearOpenTimer
    , [
        clearOpenTimer
    ]);
    $cnSS2$react.useEffect(()=>{
        const pointerGraceTimer = pointerGraceTimerRef.current;
        return ()=>{
            window.clearTimeout(pointerGraceTimer);
            onPointerGraceIntentChange(null);
        };
    }, [
        pointerGraceTimerRef,
        onPointerGraceIntentChange
    ]);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$export$9fa5ebd18bee4d43, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        asChild: true
    }, scope), /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuItemImpl, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        id: subContext.triggerId,
        "aria-haspopup": "menu",
        "aria-expanded": context.open,
        "aria-controls": subContext.contentId,
        "data-state": $213e4d2df823067d$var$getOpenState(context.open)
    }, props, {
        ref: $cnSS2$radixuireactcomposerefs.composeRefs(forwardedRef, subContext.onTriggerChange) // This is redundant for mouse users but we cannot determine pointer type from
        ,
        onClick: (event)=>{
            var _props$onClick;
            (_props$onClick = props.onClick) === null || _props$onClick === void 0 || _props$onClick.call(props, event);
            if (props.disabled || event.defaultPrevented) return;
            /**
       * We manually focus because iOS Safari doesn't always focus on click (e.g. buttons)
       * and we rely heavily on `onFocusOutside` for submenus to close when switching
       * between separate submenus.
       */ event.currentTarget.focus();
            if (!context.open) context.onOpenChange(true);
        },
        onPointerMove: $cnSS2$radixuiprimitive.composeEventHandlers(props.onPointerMove, $213e4d2df823067d$var$whenMouse((event)=>{
            contentContext.onItemEnter(event);
            if (event.defaultPrevented) return;
            if (!props.disabled && !context.open && !openTimerRef.current) {
                contentContext.onPointerGraceIntentChange(null);
                openTimerRef.current = window.setTimeout(()=>{
                    context.onOpenChange(true);
                    clearOpenTimer();
                }, 100);
            }
        })),
        onPointerLeave: $cnSS2$radixuiprimitive.composeEventHandlers(props.onPointerLeave, $213e4d2df823067d$var$whenMouse((event)=>{
            var _context$content;
            clearOpenTimer();
            const contentRect = (_context$content = context.content) === null || _context$content === void 0 ? void 0 : _context$content.getBoundingClientRect();
            if (contentRect) {
                var _context$content2;
                // TODO: make sure to update this when we change positioning logic
                const side = (_context$content2 = context.content) === null || _context$content2 === void 0 ? void 0 : _context$content2.dataset.side;
                const rightSide = side === 'right';
                const bleed = rightSide ? -5 : 5;
                const contentNearEdge = contentRect[rightSide ? 'left' : 'right'];
                const contentFarEdge = contentRect[rightSide ? 'right' : 'left'];
                contentContext.onPointerGraceIntentChange({
                    area: [
                        // consistently within polygon bounds
                        {
                            x: event.clientX + bleed,
                            y: event.clientY
                        },
                        {
                            x: contentNearEdge,
                            y: contentRect.top
                        },
                        {
                            x: contentFarEdge,
                            y: contentRect.top
                        },
                        {
                            x: contentFarEdge,
                            y: contentRect.bottom
                        },
                        {
                            x: contentNearEdge,
                            y: contentRect.bottom
                        }
                    ],
                    side: side
                });
                window.clearTimeout(pointerGraceTimerRef.current);
                pointerGraceTimerRef.current = window.setTimeout(()=>contentContext.onPointerGraceIntentChange(null)
                , 300);
            } else {
                contentContext.onTriggerLeave(event);
                if (event.defaultPrevented) return; // There's 100ms where the user may leave an item before the submenu was opened.
                contentContext.onPointerGraceIntentChange(null);
            }
        })),
        onKeyDown: $cnSS2$radixuiprimitive.composeEventHandlers(props.onKeyDown, (event)=>{
            const isTypingAhead = contentContext.searchRef.current !== '';
            if (props.disabled || isTypingAhead && event.key === ' ') return;
            if ($213e4d2df823067d$var$SUB_OPEN_KEYS[rootContext.dir].includes(event.key)) {
                var _context$content3;
                context.onOpenChange(true); // The trigger may hold focus if opened via pointer interaction
                // so we ensure content is given focus again when switching to keyboard.
                (_context$content3 = context.content) === null || _context$content3 === void 0 || _context$content3.focus(); // prevent window from scrolling
                event.preventDefault();
            }
        })
    })));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$5fbbb3ba7297405f, {
    displayName: $213e4d2df823067d$var$SUB_TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * MenuSubContent
 * -----------------------------------------------------------------------------------------------*/ const $213e4d2df823067d$var$SUB_CONTENT_NAME = 'MenuSubContent';
const $213e4d2df823067d$export$e7142ab31822bde6 = /*#__PURE__*/ $cnSS2$react.forwardRef((props, forwardedRef)=>{
    const portalContext = $213e4d2df823067d$var$usePortalContext($213e4d2df823067d$var$CONTENT_NAME, props.__scopeMenu);
    const { forceMount: forceMount = portalContext.forceMount , ...subContentProps } = props;
    const context = $213e4d2df823067d$var$useMenuContext($213e4d2df823067d$var$CONTENT_NAME, props.__scopeMenu);
    const rootContext = $213e4d2df823067d$var$useMenuRootContext($213e4d2df823067d$var$CONTENT_NAME, props.__scopeMenu);
    const subContext = $213e4d2df823067d$var$useMenuSubContext($213e4d2df823067d$var$SUB_CONTENT_NAME, props.__scopeMenu);
    const ref = $cnSS2$react.useRef(null);
    const composedRefs = $cnSS2$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref);
    return /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$Collection.Provider, {
        scope: props.__scopeMenu
    }, /*#__PURE__*/ $cnSS2$react.createElement($cnSS2$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$Collection.Slot, {
        scope: props.__scopeMenu
    }, /*#__PURE__*/ $cnSS2$react.createElement($213e4d2df823067d$var$MenuContentImpl, ($parcel$interopDefault($cnSS2$babelruntimehelpersextends))({
        id: subContext.contentId,
        "aria-labelledby": subContext.triggerId
    }, subContentProps, {
        ref: composedRefs,
        align: "start",
        side: rootContext.dir === 'rtl' ? 'left' : 'right',
        disableOutsidePointerEvents: false,
        disableOutsideScroll: false,
        trapFocus: false,
        onOpenAutoFocus: (event)=>{
            var _ref$current;
            // when opening a submenu, focus content for keyboard users only
            if (rootContext.isUsingKeyboardRef.current) (_ref$current = ref.current) === null || _ref$current === void 0 || _ref$current.focus();
            event.preventDefault();
        } // The menu might close because of focusing another menu item in the parent menu. We
        ,
        onCloseAutoFocus: (event)=>event.preventDefault()
        ,
        onFocusOutside: $cnSS2$radixuiprimitive.composeEventHandlers(props.onFocusOutside, (event)=>{
            // We prevent closing when the trigger is focused to avoid triggering a re-open animation
            // on pointer interaction.
            if (event.target !== subContext.trigger) context.onOpenChange(false);
        }),
        onEscapeKeyDown: $cnSS2$radixuiprimitive.composeEventHandlers(props.onEscapeKeyDown, (event)=>{
            rootContext.onClose(); // ensure pressing escape in submenu doesn't escape full screen mode
            event.preventDefault();
        }),
        onKeyDown: $cnSS2$radixuiprimitive.composeEventHandlers(props.onKeyDown, (event)=>{
            // Submenu key events bubble through portals. We only care about keys in this menu.
            const isKeyDownInside = event.currentTarget.contains(event.target);
            const isCloseKey = $213e4d2df823067d$var$SUB_CLOSE_KEYS[rootContext.dir].includes(event.key);
            if (isKeyDownInside && isCloseKey) {
                var _subContext$trigger;
                context.onOpenChange(false); // We focus manually because we prevented it in `onCloseAutoFocus`
                (_subContext$trigger = subContext.trigger) === null || _subContext$trigger === void 0 || _subContext$trigger.focus(); // prevent window from scrolling
                event.preventDefault();
            }
        })
    })))));
});
/*#__PURE__*/ Object.assign($213e4d2df823067d$export$e7142ab31822bde6, {
    displayName: $213e4d2df823067d$var$SUB_CONTENT_NAME
});
/* -----------------------------------------------------------------------------------------------*/ function $213e4d2df823067d$var$getOpenState(open) {
    return open ? 'open' : 'closed';
}
function $213e4d2df823067d$var$isIndeterminate(checked) {
    return checked === 'indeterminate';
}
function $213e4d2df823067d$var$getCheckedState(checked) {
    return $213e4d2df823067d$var$isIndeterminate(checked) ? 'indeterminate' : checked ? 'checked' : 'unchecked';
}
function $213e4d2df823067d$var$focusFirst(candidates) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates){
        // if focus is already where we want to go, we don't want to keep going through the candidates
        if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
        candidate.focus();
        if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
}
/**
 * Wraps an array around itself at a given start index
 * Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
 */ function $213e4d2df823067d$var$wrapArray(array, startIndex) {
    return array.map((_, index)=>array[(startIndex + index) % array.length]
    );
}
/**
 * This is the "meat" of the typeahead matching logic. It takes in all the values,
 * the search and the current match, and returns the next match (or `undefined`).
 *
 * We normalize the search because if a user has repeatedly pressed a character,
 * we want the exact same behavior as if we only had that one character
 * (ie. cycle through options starting with that character)
 *
 * We also reorder the values by wrapping the array around the current match.
 * This is so we always look forward from the current match, and picking the first
 * match will always be the correct one.
 *
 * Finally, if the normalized search is exactly one character, we exclude the
 * current match from the values because otherwise it would be the first to match always
 * and focus would never move. This is as opposed to the regular case, where we
 * don't want focus to move if the current match still matches.
 */ function $213e4d2df823067d$var$getNextMatch(values, search, currentMatch) {
    const isRepeated = search.length > 1 && Array.from(search).every((char)=>char === search[0]
    );
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
    let wrappedValues = $213e4d2df823067d$var$wrapArray(values, Math.max(currentMatchIndex, 0));
    const excludeCurrentMatch = normalizedSearch.length === 1;
    if (excludeCurrentMatch) wrappedValues = wrappedValues.filter((v)=>v !== currentMatch
    );
    const nextMatch = wrappedValues.find((value)=>value.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextMatch !== currentMatch ? nextMatch : undefined;
}
// Determine if a point is inside of a polygon.
// Based on https://github.com/substack/point-in-polygon
function $213e4d2df823067d$var$isPointInPolygon(point, polygon) {
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
}
function $213e4d2df823067d$var$isPointerInGraceArea(event, area) {
    if (!area) return false;
    const cursorPos = {
        x: event.clientX,
        y: event.clientY
    };
    return $213e4d2df823067d$var$isPointInPolygon(cursorPos, area);
}
function $213e4d2df823067d$var$whenMouse(handler) {
    return (event)=>event.pointerType === 'mouse' ? handler(event) : undefined
    ;
}
const $213e4d2df823067d$export$be92b6f5f03c0fe9 = $213e4d2df823067d$export$d9b273488cd8ce6f;
const $213e4d2df823067d$export$b688253958b8dfe7 = $213e4d2df823067d$export$9fa5ebd18bee4d43;
const $213e4d2df823067d$export$602eac185826482c = $213e4d2df823067d$export$793392f970497feb;
const $213e4d2df823067d$export$7c6e2c02157bb7d2 = $213e4d2df823067d$export$479f0f2f71193efe;
const $213e4d2df823067d$export$eb2fcfdbd7ba97d4 = $213e4d2df823067d$export$22a631d1f72787bb;
const $213e4d2df823067d$export$b04be29aa201d4f5 = $213e4d2df823067d$export$dd37bec0e8a99143;
const $213e4d2df823067d$export$6d08773d2e66f8f2 = $213e4d2df823067d$export$2ce376c2cc3355c8;
const $213e4d2df823067d$export$16ce288f89fa631c = $213e4d2df823067d$export$f6f243521332502d;
const $213e4d2df823067d$export$a98f0dcb43a68a25 = $213e4d2df823067d$export$ea2200c9eee416b3;
const $213e4d2df823067d$export$371ab307eab489c0 = $213e4d2df823067d$export$69bd225e9817f6d0;
const $213e4d2df823067d$export$c3468e2714d175fa = $213e4d2df823067d$export$a2593e23056970a3;
const $213e4d2df823067d$export$1ff3c3f08ae963c0 = $213e4d2df823067d$export$1cec7dcdd713e220;
const $213e4d2df823067d$export$21b07c8f274aebd5 = $213e4d2df823067d$export$bcdda4773debf5fa;
const $213e4d2df823067d$export$d7a01e11500dfb6f = $213e4d2df823067d$export$71bdb9d1e2909932;
const $213e4d2df823067d$export$2ea8a7a591ac5eac = $213e4d2df823067d$export$5fbbb3ba7297405f;
const $213e4d2df823067d$export$6d4de93b380beddf = $213e4d2df823067d$export$e7142ab31822bde6;




//# sourceMappingURL=index.js.map
