var $hLIh8$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $hLIh8$react = require("react");
var $hLIh8$radixuireactcontext = require("@radix-ui/react-context");
var $hLIh8$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $hLIh8$radixuireactdialog = require("@radix-ui/react-dialog");
var $hLIh8$radixuiprimitive = require("@radix-ui/primitive");
var $hLIh8$radixuireactslot = require("@radix-ui/react-slot");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createAlertDialogScope", () => $8c7baeec26a63e97$export$b8891880751c2c5b);
$parcel$export(module.exports, "AlertDialog", () => $8c7baeec26a63e97$export$de466dd8317b0b75);
$parcel$export(module.exports, "AlertDialogTrigger", () => $8c7baeec26a63e97$export$6edd7a623ef0f40b);
$parcel$export(module.exports, "AlertDialogPortal", () => $8c7baeec26a63e97$export$660f2bfdb986706c);
$parcel$export(module.exports, "AlertDialogOverlay", () => $8c7baeec26a63e97$export$a707a4895ce23256);
$parcel$export(module.exports, "AlertDialogContent", () => $8c7baeec26a63e97$export$94e6af45f0af4efd);
$parcel$export(module.exports, "AlertDialogAction", () => $8c7baeec26a63e97$export$b454f818c58ee85d);
$parcel$export(module.exports, "AlertDialogCancel", () => $8c7baeec26a63e97$export$2f67a923571aaea0);
$parcel$export(module.exports, "AlertDialogTitle", () => $8c7baeec26a63e97$export$225e0da62d314b7);
$parcel$export(module.exports, "AlertDialogDescription", () => $8c7baeec26a63e97$export$a23b55cde55ad9a5);
$parcel$export(module.exports, "Root", () => $8c7baeec26a63e97$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Trigger", () => $8c7baeec26a63e97$export$41fb9f06171c75f4);
$parcel$export(module.exports, "Portal", () => $8c7baeec26a63e97$export$602eac185826482c);
$parcel$export(module.exports, "Overlay", () => $8c7baeec26a63e97$export$c6fdb837b070b4ff);
$parcel$export(module.exports, "Content", () => $8c7baeec26a63e97$export$7c6e2c02157bb7d2);
$parcel$export(module.exports, "Action", () => $8c7baeec26a63e97$export$e19cd5f9376f8cee);
$parcel$export(module.exports, "Cancel", () => $8c7baeec26a63e97$export$848c9b7ead0df967);
$parcel$export(module.exports, "Title", () => $8c7baeec26a63e97$export$f99233281efd08a0);
$parcel$export(module.exports, "Description", () => $8c7baeec26a63e97$export$393edc798c47379d);








/* -------------------------------------------------------------------------------------------------
 * AlertDialog
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$ROOT_NAME = 'AlertDialog';
const [$8c7baeec26a63e97$var$createAlertDialogContext, $8c7baeec26a63e97$export$b8891880751c2c5b] = $hLIh8$radixuireactcontext.createContextScope($8c7baeec26a63e97$var$ROOT_NAME, [
    $hLIh8$radixuireactdialog.createDialogScope
]);
const $8c7baeec26a63e97$var$useDialogScope = $hLIh8$radixuireactdialog.createDialogScope();
const $8c7baeec26a63e97$export$de466dd8317b0b75 = (props)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...alertDialogProps } = props;
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Root, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({}, dialogScope, alertDialogProps, {
        modal: true
    }));
};
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$de466dd8317b0b75, {
    displayName: $8c7baeec26a63e97$var$ROOT_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogTrigger
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$TRIGGER_NAME = 'AlertDialogTrigger';
const $8c7baeec26a63e97$export$6edd7a623ef0f40b = /*#__PURE__*/ $hLIh8$react.forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...triggerProps } = props;
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Trigger, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({}, dialogScope, triggerProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$6edd7a623ef0f40b, {
    displayName: $8c7baeec26a63e97$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogPortal
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$PORTAL_NAME = 'AlertDialogPortal';
const $8c7baeec26a63e97$export$660f2bfdb986706c = (props)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...portalProps } = props;
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Portal, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({}, dialogScope, portalProps));
};
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$660f2bfdb986706c, {
    displayName: $8c7baeec26a63e97$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogOverlay
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$OVERLAY_NAME = 'AlertDialogOverlay';
const $8c7baeec26a63e97$export$a707a4895ce23256 = /*#__PURE__*/ $hLIh8$react.forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...overlayProps } = props;
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Overlay, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({}, dialogScope, overlayProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$a707a4895ce23256, {
    displayName: $8c7baeec26a63e97$var$OVERLAY_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogContent
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$CONTENT_NAME = 'AlertDialogContent';
const [$8c7baeec26a63e97$var$AlertDialogContentProvider, $8c7baeec26a63e97$var$useAlertDialogContentContext] = $8c7baeec26a63e97$var$createAlertDialogContext($8c7baeec26a63e97$var$CONTENT_NAME);
const $8c7baeec26a63e97$export$94e6af45f0af4efd = /*#__PURE__*/ $hLIh8$react.forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , children: children , ...contentProps } = props;
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    const contentRef = $hLIh8$react.useRef(null);
    const composedRefs = $hLIh8$radixuireactcomposerefs.useComposedRefs(forwardedRef, contentRef);
    const cancelRef = $hLIh8$react.useRef(null);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.WarningProvider, {
        contentName: $8c7baeec26a63e97$var$CONTENT_NAME,
        titleName: $8c7baeec26a63e97$var$TITLE_NAME,
        docsSlug: "alert-dialog"
    }, /*#__PURE__*/ $hLIh8$react.createElement($8c7baeec26a63e97$var$AlertDialogContentProvider, {
        scope: __scopeAlertDialog,
        cancelRef: cancelRef
    }, /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Content, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({
        role: "alertdialog"
    }, dialogScope, contentProps, {
        ref: composedRefs,
        onOpenAutoFocus: $hLIh8$radixuiprimitive.composeEventHandlers(contentProps.onOpenAutoFocus, (event)=>{
            var _cancelRef$current;
            event.preventDefault();
            (_cancelRef$current = cancelRef.current) === null || _cancelRef$current === void 0 || _cancelRef$current.focus({
                preventScroll: true
            });
        }),
        onPointerDownOutside: (event)=>event.preventDefault()
        ,
        onInteractOutside: (event)=>event.preventDefault()
    }), /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactslot.Slottable, null, children), false)));
});
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$94e6af45f0af4efd, {
    displayName: $8c7baeec26a63e97$var$CONTENT_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogTitle
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$TITLE_NAME = 'AlertDialogTitle';
const $8c7baeec26a63e97$export$225e0da62d314b7 = /*#__PURE__*/ $hLIh8$react.forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...titleProps } = props;
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Title, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({}, dialogScope, titleProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$225e0da62d314b7, {
    displayName: $8c7baeec26a63e97$var$TITLE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogDescription
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$DESCRIPTION_NAME = 'AlertDialogDescription';
const $8c7baeec26a63e97$export$a23b55cde55ad9a5 = /*#__PURE__*/ $hLIh8$react.forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...descriptionProps } = props;
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Description, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({}, dialogScope, descriptionProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$a23b55cde55ad9a5, {
    displayName: $8c7baeec26a63e97$var$DESCRIPTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogAction
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$ACTION_NAME = 'AlertDialogAction';
const $8c7baeec26a63e97$export$b454f818c58ee85d = /*#__PURE__*/ $hLIh8$react.forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...actionProps } = props;
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Close, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({}, dialogScope, actionProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$b454f818c58ee85d, {
    displayName: $8c7baeec26a63e97$var$ACTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogCancel
 * -----------------------------------------------------------------------------------------------*/ const $8c7baeec26a63e97$var$CANCEL_NAME = 'AlertDialogCancel';
const $8c7baeec26a63e97$export$2f67a923571aaea0 = /*#__PURE__*/ $hLIh8$react.forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...cancelProps } = props;
    const { cancelRef: cancelRef  } = $8c7baeec26a63e97$var$useAlertDialogContentContext($8c7baeec26a63e97$var$CANCEL_NAME, __scopeAlertDialog);
    const dialogScope = $8c7baeec26a63e97$var$useDialogScope(__scopeAlertDialog);
    const ref = $hLIh8$radixuireactcomposerefs.useComposedRefs(forwardedRef, cancelRef);
    return /*#__PURE__*/ $hLIh8$react.createElement($hLIh8$radixuireactdialog.Close, ($parcel$interopDefault($hLIh8$babelruntimehelpersextends))({}, dialogScope, cancelProps, {
        ref: ref
    }));
});
/*#__PURE__*/ Object.assign($8c7baeec26a63e97$export$2f67a923571aaea0, {
    displayName: $8c7baeec26a63e97$var$CANCEL_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $8c7baeec26a63e97$var$DescriptionWarning = ({ contentRef: contentRef  })=>{
    const MESSAGE = `\`${$8c7baeec26a63e97$var$CONTENT_NAME}\` requires a description for the component to be accessible for screen reader users.

You can add a description to the \`${$8c7baeec26a63e97$var$CONTENT_NAME}\` by passing a \`${$8c7baeec26a63e97$var$DESCRIPTION_NAME}\` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an \`id\` and passing the same value to the \`aria-describedby\` prop in \`${$8c7baeec26a63e97$var$CONTENT_NAME}\`. If the description is confusing or duplicative for sighted users, you can use the \`@radix-ui/react-visually-hidden\` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog`;
    $hLIh8$react.useEffect(()=>{
        var _contentRef$current;
        const hasDescription = document.getElementById((_contentRef$current = contentRef.current) === null || _contentRef$current === void 0 ? void 0 : _contentRef$current.getAttribute('aria-describedby'));
        if (!hasDescription) console.warn(MESSAGE);
    }, [
        MESSAGE,
        contentRef
    ]);
    return null;
};
const $8c7baeec26a63e97$export$be92b6f5f03c0fe9 = $8c7baeec26a63e97$export$de466dd8317b0b75;
const $8c7baeec26a63e97$export$41fb9f06171c75f4 = $8c7baeec26a63e97$export$6edd7a623ef0f40b;
const $8c7baeec26a63e97$export$602eac185826482c = $8c7baeec26a63e97$export$660f2bfdb986706c;
const $8c7baeec26a63e97$export$c6fdb837b070b4ff = $8c7baeec26a63e97$export$a707a4895ce23256;
const $8c7baeec26a63e97$export$7c6e2c02157bb7d2 = $8c7baeec26a63e97$export$94e6af45f0af4efd;
const $8c7baeec26a63e97$export$e19cd5f9376f8cee = $8c7baeec26a63e97$export$b454f818c58ee85d;
const $8c7baeec26a63e97$export$848c9b7ead0df967 = $8c7baeec26a63e97$export$2f67a923571aaea0;
const $8c7baeec26a63e97$export$f99233281efd08a0 = $8c7baeec26a63e97$export$225e0da62d314b7;
const $8c7baeec26a63e97$export$393edc798c47379d = $8c7baeec26a63e97$export$a23b55cde55ad9a5;




//# sourceMappingURL=index.js.map
