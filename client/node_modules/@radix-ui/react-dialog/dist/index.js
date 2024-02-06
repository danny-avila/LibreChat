var $aJCrN$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $aJCrN$react = require("react");
var $aJCrN$radixuiprimitive = require("@radix-ui/primitive");
var $aJCrN$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $aJCrN$radixuireactcontext = require("@radix-ui/react-context");
var $aJCrN$radixuireactid = require("@radix-ui/react-id");
var $aJCrN$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $aJCrN$radixuireactdismissablelayer = require("@radix-ui/react-dismissable-layer");
var $aJCrN$radixuireactfocusscope = require("@radix-ui/react-focus-scope");
var $aJCrN$radixuireactportal = require("@radix-ui/react-portal");
var $aJCrN$radixuireactpresence = require("@radix-ui/react-presence");
var $aJCrN$radixuireactprimitive = require("@radix-ui/react-primitive");
var $aJCrN$radixuireactfocusguards = require("@radix-ui/react-focus-guards");
var $aJCrN$reactremovescroll = require("react-remove-scroll");
var $aJCrN$ariahidden = require("aria-hidden");
var $aJCrN$radixuireactslot = require("@radix-ui/react-slot");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createDialogScope", () => $f4833395aa1bca1a$export$cc702773b8ea3e41);
$parcel$export(module.exports, "Dialog", () => $f4833395aa1bca1a$export$3ddf2d174ce01153);
$parcel$export(module.exports, "DialogTrigger", () => $f4833395aa1bca1a$export$2e1e1122cf0cba88);
$parcel$export(module.exports, "DialogPortal", () => $f4833395aa1bca1a$export$dad7c95542bacce0);
$parcel$export(module.exports, "DialogOverlay", () => $f4833395aa1bca1a$export$bd1d06c79be19e17);
$parcel$export(module.exports, "DialogContent", () => $f4833395aa1bca1a$export$b6d9565de1e068cf);
$parcel$export(module.exports, "DialogTitle", () => $f4833395aa1bca1a$export$16f7638e4a34b909);
$parcel$export(module.exports, "DialogDescription", () => $f4833395aa1bca1a$export$94e94c2ec2c954d5);
$parcel$export(module.exports, "DialogClose", () => $f4833395aa1bca1a$export$fba2fb7cd781b7ac);
$parcel$export(module.exports, "Root", () => $f4833395aa1bca1a$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Trigger", () => $f4833395aa1bca1a$export$41fb9f06171c75f4);
$parcel$export(module.exports, "Portal", () => $f4833395aa1bca1a$export$602eac185826482c);
$parcel$export(module.exports, "Overlay", () => $f4833395aa1bca1a$export$c6fdb837b070b4ff);
$parcel$export(module.exports, "Content", () => $f4833395aa1bca1a$export$7c6e2c02157bb7d2);
$parcel$export(module.exports, "Title", () => $f4833395aa1bca1a$export$f99233281efd08a0);
$parcel$export(module.exports, "Description", () => $f4833395aa1bca1a$export$393edc798c47379d);
$parcel$export(module.exports, "Close", () => $f4833395aa1bca1a$export$f39c2d165cd861fe);
$parcel$export(module.exports, "WarningProvider", () => $f4833395aa1bca1a$export$69b62a49393917d6);
















/* -------------------------------------------------------------------------------------------------
 * Dialog
 * -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$DIALOG_NAME = 'Dialog';
const [$f4833395aa1bca1a$var$createDialogContext, $f4833395aa1bca1a$export$cc702773b8ea3e41] = $aJCrN$radixuireactcontext.createContextScope($f4833395aa1bca1a$var$DIALOG_NAME);
const [$f4833395aa1bca1a$var$DialogProvider, $f4833395aa1bca1a$var$useDialogContext] = $f4833395aa1bca1a$var$createDialogContext($f4833395aa1bca1a$var$DIALOG_NAME);
const $f4833395aa1bca1a$export$3ddf2d174ce01153 = (props)=>{
    const { __scopeDialog: __scopeDialog , children: children , open: openProp , defaultOpen: defaultOpen , onOpenChange: onOpenChange , modal: modal = true  } = props;
    const triggerRef = $aJCrN$react.useRef(null);
    const contentRef = $aJCrN$react.useRef(null);
    const [open = false, setOpen] = $aJCrN$radixuireactusecontrollablestate.useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    return /*#__PURE__*/ $aJCrN$react.createElement($f4833395aa1bca1a$var$DialogProvider, {
        scope: __scopeDialog,
        triggerRef: triggerRef,
        contentRef: contentRef,
        contentId: $aJCrN$radixuireactid.useId(),
        titleId: $aJCrN$radixuireactid.useId(),
        descriptionId: $aJCrN$radixuireactid.useId(),
        open: open,
        onOpenChange: setOpen,
        onOpenToggle: $aJCrN$react.useCallback(()=>setOpen((prevOpen)=>!prevOpen
            )
        , [
            setOpen
        ]),
        modal: modal
    }, children);
};
/*#__PURE__*/ Object.assign($f4833395aa1bca1a$export$3ddf2d174ce01153, {
    displayName: $f4833395aa1bca1a$var$DIALOG_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DialogTrigger
 * -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$TRIGGER_NAME = 'DialogTrigger';
const $f4833395aa1bca1a$export$2e1e1122cf0cba88 = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDialog: __scopeDialog , ...triggerProps } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$TRIGGER_NAME, __scopeDialog);
    const composedTriggerRef = $aJCrN$radixuireactcomposerefs.useComposedRefs(forwardedRef, context.triggerRef);
    return /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": context.open,
        "aria-controls": context.contentId,
        "data-state": $f4833395aa1bca1a$var$getState(context.open)
    }, triggerProps, {
        ref: composedTriggerRef,
        onClick: $aJCrN$radixuiprimitive.composeEventHandlers(props.onClick, context.onOpenToggle)
    }));
});
/*#__PURE__*/ Object.assign($f4833395aa1bca1a$export$2e1e1122cf0cba88, {
    displayName: $f4833395aa1bca1a$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DialogPortal
 * -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$PORTAL_NAME = 'DialogPortal';
const [$f4833395aa1bca1a$var$PortalProvider, $f4833395aa1bca1a$var$usePortalContext] = $f4833395aa1bca1a$var$createDialogContext($f4833395aa1bca1a$var$PORTAL_NAME, {
    forceMount: undefined
});
const $f4833395aa1bca1a$export$dad7c95542bacce0 = (props)=>{
    const { __scopeDialog: __scopeDialog , forceMount: forceMount , children: children , container: container  } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$PORTAL_NAME, __scopeDialog);
    return /*#__PURE__*/ $aJCrN$react.createElement($f4833395aa1bca1a$var$PortalProvider, {
        scope: __scopeDialog,
        forceMount: forceMount
    }, $aJCrN$react.Children.map(children, (child)=>/*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactpresence.Presence, {
            present: forceMount || context.open
        }, /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactportal.Portal, {
            asChild: true,
            container: container
        }, child))
    ));
};
/*#__PURE__*/ Object.assign($f4833395aa1bca1a$export$dad7c95542bacce0, {
    displayName: $f4833395aa1bca1a$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DialogOverlay
 * -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$OVERLAY_NAME = 'DialogOverlay';
const $f4833395aa1bca1a$export$bd1d06c79be19e17 = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const portalContext = $f4833395aa1bca1a$var$usePortalContext($f4833395aa1bca1a$var$OVERLAY_NAME, props.__scopeDialog);
    const { forceMount: forceMount = portalContext.forceMount , ...overlayProps } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$OVERLAY_NAME, props.__scopeDialog);
    return context.modal ? /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, /*#__PURE__*/ $aJCrN$react.createElement($f4833395aa1bca1a$var$DialogOverlayImpl, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({}, overlayProps, {
        ref: forwardedRef
    }))) : null;
});
/*#__PURE__*/ Object.assign($f4833395aa1bca1a$export$bd1d06c79be19e17, {
    displayName: $f4833395aa1bca1a$var$OVERLAY_NAME
});
const $f4833395aa1bca1a$var$DialogOverlayImpl = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDialog: __scopeDialog , ...overlayProps } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$OVERLAY_NAME, __scopeDialog);
    return(/*#__PURE__*/ // Make sure `Content` is scrollable even when it doesn't live inside `RemoveScroll`
    // ie. when `Overlay` and `Content` are siblings
    $aJCrN$react.createElement($aJCrN$reactremovescroll.RemoveScroll, {
        as: $aJCrN$radixuireactslot.Slot,
        allowPinchZoom: true,
        shards: [
            context.contentRef
        ]
    }, /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({
        "data-state": $f4833395aa1bca1a$var$getState(context.open)
    }, overlayProps, {
        ref: forwardedRef // We re-enable pointer-events prevented by `Dialog.Content` to allow scrolling the overlay.
        ,
        style: {
            pointerEvents: 'auto',
            ...overlayProps.style
        }
    }))));
});
/* -------------------------------------------------------------------------------------------------
 * DialogContent
 * -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$CONTENT_NAME = 'DialogContent';
const $f4833395aa1bca1a$export$b6d9565de1e068cf = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const portalContext = $f4833395aa1bca1a$var$usePortalContext($f4833395aa1bca1a$var$CONTENT_NAME, props.__scopeDialog);
    const { forceMount: forceMount = portalContext.forceMount , ...contentProps } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$CONTENT_NAME, props.__scopeDialog);
    return /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactpresence.Presence, {
        present: forceMount || context.open
    }, context.modal ? /*#__PURE__*/ $aJCrN$react.createElement($f4833395aa1bca1a$var$DialogContentModal, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({}, contentProps, {
        ref: forwardedRef
    })) : /*#__PURE__*/ $aJCrN$react.createElement($f4833395aa1bca1a$var$DialogContentNonModal, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({}, contentProps, {
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($f4833395aa1bca1a$export$b6d9565de1e068cf, {
    displayName: $f4833395aa1bca1a$var$CONTENT_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$DialogContentModal = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$CONTENT_NAME, props.__scopeDialog);
    const contentRef = $aJCrN$react.useRef(null);
    const composedRefs = $aJCrN$radixuireactcomposerefs.useComposedRefs(forwardedRef, context.contentRef, contentRef); // aria-hide everything except the content (better supported equivalent to setting aria-modal)
    $aJCrN$react.useEffect(()=>{
        const content = contentRef.current;
        if (content) return $aJCrN$ariahidden.hideOthers(content);
    }, []);
    return /*#__PURE__*/ $aJCrN$react.createElement($f4833395aa1bca1a$var$DialogContentImpl, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({}, props, {
        ref: composedRefs // we make sure focus isn't trapped once `DialogContent` has been closed
        ,
        trapFocus: context.open,
        disableOutsidePointerEvents: true,
        onCloseAutoFocus: $aJCrN$radixuiprimitive.composeEventHandlers(props.onCloseAutoFocus, (event)=>{
            var _context$triggerRef$c;
            event.preventDefault();
            (_context$triggerRef$c = context.triggerRef.current) === null || _context$triggerRef$c === void 0 || _context$triggerRef$c.focus();
        }),
        onPointerDownOutside: $aJCrN$radixuiprimitive.composeEventHandlers(props.onPointerDownOutside, (event)=>{
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick; // If the event is a right-click, we shouldn't close because
            // it is effectively as if we right-clicked the `Overlay`.
            if (isRightClick) event.preventDefault();
        }) // When focus is trapped, a `focusout` event may still happen.
        ,
        onFocusOutside: $aJCrN$radixuiprimitive.composeEventHandlers(props.onFocusOutside, (event)=>event.preventDefault()
        )
    }));
});
/* -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$DialogContentNonModal = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$CONTENT_NAME, props.__scopeDialog);
    const hasInteractedOutsideRef = $aJCrN$react.useRef(false);
    const hasPointerDownOutsideRef = $aJCrN$react.useRef(false);
    return /*#__PURE__*/ $aJCrN$react.createElement($f4833395aa1bca1a$var$DialogContentImpl, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({}, props, {
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
/* -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$DialogContentImpl = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDialog: __scopeDialog , trapFocus: trapFocus , onOpenAutoFocus: onOpenAutoFocus , onCloseAutoFocus: onCloseAutoFocus , ...contentProps } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$CONTENT_NAME, __scopeDialog);
    const contentRef = $aJCrN$react.useRef(null);
    const composedRefs = $aJCrN$radixuireactcomposerefs.useComposedRefs(forwardedRef, contentRef); // Make sure the whole tree has focus guards as our `Dialog` will be
    // the last element in the DOM (beacuse of the `Portal`)
    $aJCrN$radixuireactfocusguards.useFocusGuards();
    return /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$react.Fragment, null, /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactfocusscope.FocusScope, {
        asChild: true,
        loop: true,
        trapped: trapFocus,
        onMountAutoFocus: onOpenAutoFocus,
        onUnmountAutoFocus: onCloseAutoFocus
    }, /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactdismissablelayer.DismissableLayer, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({
        role: "dialog",
        id: context.contentId,
        "aria-describedby": context.descriptionId,
        "aria-labelledby": context.titleId,
        "data-state": $f4833395aa1bca1a$var$getState(context.open)
    }, contentProps, {
        ref: composedRefs,
        onDismiss: ()=>context.onOpenChange(false)
    }))), false);
});
/* -------------------------------------------------------------------------------------------------
 * DialogTitle
 * -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$TITLE_NAME = 'DialogTitle';
const $f4833395aa1bca1a$export$16f7638e4a34b909 = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDialog: __scopeDialog , ...titleProps } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$TITLE_NAME, __scopeDialog);
    return /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactprimitive.Primitive.h2, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({
        id: context.titleId
    }, titleProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($f4833395aa1bca1a$export$16f7638e4a34b909, {
    displayName: $f4833395aa1bca1a$var$TITLE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DialogDescription
 * -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$DESCRIPTION_NAME = 'DialogDescription';
const $f4833395aa1bca1a$export$94e94c2ec2c954d5 = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDialog: __scopeDialog , ...descriptionProps } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$DESCRIPTION_NAME, __scopeDialog);
    return /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactprimitive.Primitive.p, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({
        id: context.descriptionId
    }, descriptionProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($f4833395aa1bca1a$export$94e94c2ec2c954d5, {
    displayName: $f4833395aa1bca1a$var$DESCRIPTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DialogClose
 * -----------------------------------------------------------------------------------------------*/ const $f4833395aa1bca1a$var$CLOSE_NAME = 'DialogClose';
const $f4833395aa1bca1a$export$fba2fb7cd781b7ac = /*#__PURE__*/ $aJCrN$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDialog: __scopeDialog , ...closeProps } = props;
    const context = $f4833395aa1bca1a$var$useDialogContext($f4833395aa1bca1a$var$CLOSE_NAME, __scopeDialog);
    return /*#__PURE__*/ $aJCrN$react.createElement($aJCrN$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($aJCrN$babelruntimehelpersextends))({
        type: "button"
    }, closeProps, {
        ref: forwardedRef,
        onClick: $aJCrN$radixuiprimitive.composeEventHandlers(props.onClick, ()=>context.onOpenChange(false)
        )
    }));
});
/*#__PURE__*/ Object.assign($f4833395aa1bca1a$export$fba2fb7cd781b7ac, {
    displayName: $f4833395aa1bca1a$var$CLOSE_NAME
});
/* -----------------------------------------------------------------------------------------------*/ function $f4833395aa1bca1a$var$getState(open) {
    return open ? 'open' : 'closed';
}
const $f4833395aa1bca1a$var$TITLE_WARNING_NAME = 'DialogTitleWarning';
const [$f4833395aa1bca1a$export$69b62a49393917d6, $f4833395aa1bca1a$var$useWarningContext] = $aJCrN$radixuireactcontext.createContext($f4833395aa1bca1a$var$TITLE_WARNING_NAME, {
    contentName: $f4833395aa1bca1a$var$CONTENT_NAME,
    titleName: $f4833395aa1bca1a$var$TITLE_NAME,
    docsSlug: 'dialog'
});
const $f4833395aa1bca1a$var$TitleWarning = ({ titleId: titleId  })=>{
    const titleWarningContext = $f4833395aa1bca1a$var$useWarningContext($f4833395aa1bca1a$var$TITLE_WARNING_NAME);
    const MESSAGE = `\`${titleWarningContext.contentName}\` requires a \`${titleWarningContext.titleName}\` for the component to be accessible for screen reader users.

If you want to hide the \`${titleWarningContext.titleName}\`, you can wrap it with our VisuallyHidden component.

For more information, see https://radix-ui.com/primitives/docs/components/${titleWarningContext.docsSlug}`;
    $aJCrN$react.useEffect(()=>{
        if (titleId) {
            const hasTitle = document.getElementById(titleId);
            if (!hasTitle) throw new Error(MESSAGE);
        }
    }, [
        MESSAGE,
        titleId
    ]);
    return null;
};
const $f4833395aa1bca1a$var$DESCRIPTION_WARNING_NAME = 'DialogDescriptionWarning';
const $f4833395aa1bca1a$var$DescriptionWarning = ({ contentRef: contentRef , descriptionId: descriptionId  })=>{
    const descriptionWarningContext = $f4833395aa1bca1a$var$useWarningContext($f4833395aa1bca1a$var$DESCRIPTION_WARNING_NAME);
    const MESSAGE = `Warning: Missing \`Description\` or \`aria-describedby={undefined}\` for {${descriptionWarningContext.contentName}}.`;
    $aJCrN$react.useEffect(()=>{
        var _contentRef$current;
        const describedById = (_contentRef$current = contentRef.current) === null || _contentRef$current === void 0 ? void 0 : _contentRef$current.getAttribute('aria-describedby'); // if we have an id and the user hasn't set aria-describedby={undefined}
        if (descriptionId && describedById) {
            const hasDescription = document.getElementById(descriptionId);
            if (!hasDescription) console.warn(MESSAGE);
        }
    }, [
        MESSAGE,
        contentRef,
        descriptionId
    ]);
    return null;
};
const $f4833395aa1bca1a$export$be92b6f5f03c0fe9 = $f4833395aa1bca1a$export$3ddf2d174ce01153;
const $f4833395aa1bca1a$export$41fb9f06171c75f4 = $f4833395aa1bca1a$export$2e1e1122cf0cba88;
const $f4833395aa1bca1a$export$602eac185826482c = $f4833395aa1bca1a$export$dad7c95542bacce0;
const $f4833395aa1bca1a$export$c6fdb837b070b4ff = $f4833395aa1bca1a$export$bd1d06c79be19e17;
const $f4833395aa1bca1a$export$7c6e2c02157bb7d2 = $f4833395aa1bca1a$export$b6d9565de1e068cf;
const $f4833395aa1bca1a$export$f99233281efd08a0 = $f4833395aa1bca1a$export$16f7638e4a34b909;
const $f4833395aa1bca1a$export$393edc798c47379d = $f4833395aa1bca1a$export$94e94c2ec2c954d5;
const $f4833395aa1bca1a$export$f39c2d165cd861fe = $f4833395aa1bca1a$export$fba2fb7cd781b7ac;




//# sourceMappingURL=index.js.map
