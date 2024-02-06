import $4k4D0$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {createElement as $4k4D0$createElement, forwardRef as $4k4D0$forwardRef, useRef as $4k4D0$useRef, useEffect as $4k4D0$useEffect} from "react";
import {createContextScope as $4k4D0$createContextScope} from "@radix-ui/react-context";
import {useComposedRefs as $4k4D0$useComposedRefs} from "@radix-ui/react-compose-refs";
import {createDialogScope as $4k4D0$createDialogScope, Root as $4k4D0$Root, Trigger as $4k4D0$Trigger, Portal as $4k4D0$Portal, Overlay as $4k4D0$Overlay, WarningProvider as $4k4D0$WarningProvider, Content as $4k4D0$Content, Title as $4k4D0$Title, Description as $4k4D0$Description, Close as $4k4D0$Close} from "@radix-ui/react-dialog";
import {composeEventHandlers as $4k4D0$composeEventHandlers} from "@radix-ui/primitive";
import {Slottable as $4k4D0$Slottable} from "@radix-ui/react-slot";









/* -------------------------------------------------------------------------------------------------
 * AlertDialog
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$ROOT_NAME = 'AlertDialog';
const [$905f4ae918aab1aa$var$createAlertDialogContext, $905f4ae918aab1aa$export$b8891880751c2c5b] = $4k4D0$createContextScope($905f4ae918aab1aa$var$ROOT_NAME, [
    $4k4D0$createDialogScope
]);
const $905f4ae918aab1aa$var$useDialogScope = $4k4D0$createDialogScope();
const $905f4ae918aab1aa$export$de466dd8317b0b75 = (props)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...alertDialogProps } = props;
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$Root, $4k4D0$babelruntimehelpersesmextends({}, dialogScope, alertDialogProps, {
        modal: true
    }));
};
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$de466dd8317b0b75, {
    displayName: $905f4ae918aab1aa$var$ROOT_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogTrigger
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$TRIGGER_NAME = 'AlertDialogTrigger';
const $905f4ae918aab1aa$export$6edd7a623ef0f40b = /*#__PURE__*/ $4k4D0$forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...triggerProps } = props;
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$Trigger, $4k4D0$babelruntimehelpersesmextends({}, dialogScope, triggerProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$6edd7a623ef0f40b, {
    displayName: $905f4ae918aab1aa$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogPortal
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$PORTAL_NAME = 'AlertDialogPortal';
const $905f4ae918aab1aa$export$660f2bfdb986706c = (props)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...portalProps } = props;
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$Portal, $4k4D0$babelruntimehelpersesmextends({}, dialogScope, portalProps));
};
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$660f2bfdb986706c, {
    displayName: $905f4ae918aab1aa$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogOverlay
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$OVERLAY_NAME = 'AlertDialogOverlay';
const $905f4ae918aab1aa$export$a707a4895ce23256 = /*#__PURE__*/ $4k4D0$forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...overlayProps } = props;
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$Overlay, $4k4D0$babelruntimehelpersesmextends({}, dialogScope, overlayProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$a707a4895ce23256, {
    displayName: $905f4ae918aab1aa$var$OVERLAY_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogContent
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$CONTENT_NAME = 'AlertDialogContent';
const [$905f4ae918aab1aa$var$AlertDialogContentProvider, $905f4ae918aab1aa$var$useAlertDialogContentContext] = $905f4ae918aab1aa$var$createAlertDialogContext($905f4ae918aab1aa$var$CONTENT_NAME);
const $905f4ae918aab1aa$export$94e6af45f0af4efd = /*#__PURE__*/ $4k4D0$forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , children: children , ...contentProps } = props;
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    const contentRef = $4k4D0$useRef(null);
    const composedRefs = $4k4D0$useComposedRefs(forwardedRef, contentRef);
    const cancelRef = $4k4D0$useRef(null);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$WarningProvider, {
        contentName: $905f4ae918aab1aa$var$CONTENT_NAME,
        titleName: $905f4ae918aab1aa$var$TITLE_NAME,
        docsSlug: "alert-dialog"
    }, /*#__PURE__*/ $4k4D0$createElement($905f4ae918aab1aa$var$AlertDialogContentProvider, {
        scope: __scopeAlertDialog,
        cancelRef: cancelRef
    }, /*#__PURE__*/ $4k4D0$createElement($4k4D0$Content, $4k4D0$babelruntimehelpersesmextends({
        role: "alertdialog"
    }, dialogScope, contentProps, {
        ref: composedRefs,
        onOpenAutoFocus: $4k4D0$composeEventHandlers(contentProps.onOpenAutoFocus, (event)=>{
            var _cancelRef$current;
            event.preventDefault();
            (_cancelRef$current = cancelRef.current) === null || _cancelRef$current === void 0 || _cancelRef$current.focus({
                preventScroll: true
            });
        }),
        onPointerDownOutside: (event)=>event.preventDefault()
        ,
        onInteractOutside: (event)=>event.preventDefault()
    }), /*#__PURE__*/ $4k4D0$createElement($4k4D0$Slottable, null, children), false)));
});
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$94e6af45f0af4efd, {
    displayName: $905f4ae918aab1aa$var$CONTENT_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogTitle
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$TITLE_NAME = 'AlertDialogTitle';
const $905f4ae918aab1aa$export$225e0da62d314b7 = /*#__PURE__*/ $4k4D0$forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...titleProps } = props;
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$Title, $4k4D0$babelruntimehelpersesmextends({}, dialogScope, titleProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$225e0da62d314b7, {
    displayName: $905f4ae918aab1aa$var$TITLE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogDescription
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$DESCRIPTION_NAME = 'AlertDialogDescription';
const $905f4ae918aab1aa$export$a23b55cde55ad9a5 = /*#__PURE__*/ $4k4D0$forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...descriptionProps } = props;
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$Description, $4k4D0$babelruntimehelpersesmextends({}, dialogScope, descriptionProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$a23b55cde55ad9a5, {
    displayName: $905f4ae918aab1aa$var$DESCRIPTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogAction
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$ACTION_NAME = 'AlertDialogAction';
const $905f4ae918aab1aa$export$b454f818c58ee85d = /*#__PURE__*/ $4k4D0$forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...actionProps } = props;
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$Close, $4k4D0$babelruntimehelpersesmextends({}, dialogScope, actionProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$b454f818c58ee85d, {
    displayName: $905f4ae918aab1aa$var$ACTION_NAME
});
/* -------------------------------------------------------------------------------------------------
 * AlertDialogCancel
 * -----------------------------------------------------------------------------------------------*/ const $905f4ae918aab1aa$var$CANCEL_NAME = 'AlertDialogCancel';
const $905f4ae918aab1aa$export$2f67a923571aaea0 = /*#__PURE__*/ $4k4D0$forwardRef((props, forwardedRef)=>{
    const { __scopeAlertDialog: __scopeAlertDialog , ...cancelProps } = props;
    const { cancelRef: cancelRef  } = $905f4ae918aab1aa$var$useAlertDialogContentContext($905f4ae918aab1aa$var$CANCEL_NAME, __scopeAlertDialog);
    const dialogScope = $905f4ae918aab1aa$var$useDialogScope(__scopeAlertDialog);
    const ref = $4k4D0$useComposedRefs(forwardedRef, cancelRef);
    return /*#__PURE__*/ $4k4D0$createElement($4k4D0$Close, $4k4D0$babelruntimehelpersesmextends({}, dialogScope, cancelProps, {
        ref: ref
    }));
});
/*#__PURE__*/ Object.assign($905f4ae918aab1aa$export$2f67a923571aaea0, {
    displayName: $905f4ae918aab1aa$var$CANCEL_NAME
});
/* ---------------------------------------------------------------------------------------------- */ const $905f4ae918aab1aa$var$DescriptionWarning = ({ contentRef: contentRef  })=>{
    const MESSAGE = `\`${$905f4ae918aab1aa$var$CONTENT_NAME}\` requires a description for the component to be accessible for screen reader users.

You can add a description to the \`${$905f4ae918aab1aa$var$CONTENT_NAME}\` by passing a \`${$905f4ae918aab1aa$var$DESCRIPTION_NAME}\` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an \`id\` and passing the same value to the \`aria-describedby\` prop in \`${$905f4ae918aab1aa$var$CONTENT_NAME}\`. If the description is confusing or duplicative for sighted users, you can use the \`@radix-ui/react-visually-hidden\` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog`;
    $4k4D0$useEffect(()=>{
        var _contentRef$current;
        const hasDescription = document.getElementById((_contentRef$current = contentRef.current) === null || _contentRef$current === void 0 ? void 0 : _contentRef$current.getAttribute('aria-describedby'));
        if (!hasDescription) console.warn(MESSAGE);
    }, [
        MESSAGE,
        contentRef
    ]);
    return null;
};
const $905f4ae918aab1aa$export$be92b6f5f03c0fe9 = $905f4ae918aab1aa$export$de466dd8317b0b75;
const $905f4ae918aab1aa$export$41fb9f06171c75f4 = $905f4ae918aab1aa$export$6edd7a623ef0f40b;
const $905f4ae918aab1aa$export$602eac185826482c = $905f4ae918aab1aa$export$660f2bfdb986706c;
const $905f4ae918aab1aa$export$c6fdb837b070b4ff = $905f4ae918aab1aa$export$a707a4895ce23256;
const $905f4ae918aab1aa$export$7c6e2c02157bb7d2 = $905f4ae918aab1aa$export$94e6af45f0af4efd;
const $905f4ae918aab1aa$export$e19cd5f9376f8cee = $905f4ae918aab1aa$export$b454f818c58ee85d;
const $905f4ae918aab1aa$export$848c9b7ead0df967 = $905f4ae918aab1aa$export$2f67a923571aaea0;
const $905f4ae918aab1aa$export$f99233281efd08a0 = $905f4ae918aab1aa$export$225e0da62d314b7;
const $905f4ae918aab1aa$export$393edc798c47379d = $905f4ae918aab1aa$export$a23b55cde55ad9a5;




export {$905f4ae918aab1aa$export$b8891880751c2c5b as createAlertDialogScope, $905f4ae918aab1aa$export$de466dd8317b0b75 as AlertDialog, $905f4ae918aab1aa$export$6edd7a623ef0f40b as AlertDialogTrigger, $905f4ae918aab1aa$export$660f2bfdb986706c as AlertDialogPortal, $905f4ae918aab1aa$export$a707a4895ce23256 as AlertDialogOverlay, $905f4ae918aab1aa$export$94e6af45f0af4efd as AlertDialogContent, $905f4ae918aab1aa$export$b454f818c58ee85d as AlertDialogAction, $905f4ae918aab1aa$export$2f67a923571aaea0 as AlertDialogCancel, $905f4ae918aab1aa$export$225e0da62d314b7 as AlertDialogTitle, $905f4ae918aab1aa$export$a23b55cde55ad9a5 as AlertDialogDescription, $905f4ae918aab1aa$export$be92b6f5f03c0fe9 as Root, $905f4ae918aab1aa$export$41fb9f06171c75f4 as Trigger, $905f4ae918aab1aa$export$602eac185826482c as Portal, $905f4ae918aab1aa$export$c6fdb837b070b4ff as Overlay, $905f4ae918aab1aa$export$7c6e2c02157bb7d2 as Content, $905f4ae918aab1aa$export$e19cd5f9376f8cee as Action, $905f4ae918aab1aa$export$848c9b7ead0df967 as Cancel, $905f4ae918aab1aa$export$f99233281efd08a0 as Title, $905f4ae918aab1aa$export$393edc798c47379d as Description};
//# sourceMappingURL=index.mjs.map
