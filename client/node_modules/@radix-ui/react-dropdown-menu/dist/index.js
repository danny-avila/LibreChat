var $7dQ7Q$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $7dQ7Q$react = require("react");
var $7dQ7Q$radixuiprimitive = require("@radix-ui/primitive");
var $7dQ7Q$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $7dQ7Q$radixuireactcontext = require("@radix-ui/react-context");
var $7dQ7Q$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $7dQ7Q$radixuireactprimitive = require("@radix-ui/react-primitive");
var $7dQ7Q$radixuireactmenu = require("@radix-ui/react-menu");
var $7dQ7Q$radixuireactid = require("@radix-ui/react-id");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createDropdownMenuScope", () => $d1bf075a6b218014$export$c0623cd925aeb687);
$parcel$export(module.exports, "DropdownMenu", () => $d1bf075a6b218014$export$e44a253a59704894);
$parcel$export(module.exports, "DropdownMenuTrigger", () => $d1bf075a6b218014$export$d2469213b3befba9);
$parcel$export(module.exports, "DropdownMenuPortal", () => $d1bf075a6b218014$export$cd369b4d4d54efc9);
$parcel$export(module.exports, "DropdownMenuContent", () => $d1bf075a6b218014$export$6e76d93a37c01248);
$parcel$export(module.exports, "DropdownMenuGroup", () => $d1bf075a6b218014$export$246bebaba3a2f70e);
$parcel$export(module.exports, "DropdownMenuLabel", () => $d1bf075a6b218014$export$76e48c5b57f24495);
$parcel$export(module.exports, "DropdownMenuItem", () => $d1bf075a6b218014$export$ed97964d1871885d);
$parcel$export(module.exports, "DropdownMenuCheckboxItem", () => $d1bf075a6b218014$export$53a69729da201fa9);
$parcel$export(module.exports, "DropdownMenuRadioGroup", () => $d1bf075a6b218014$export$3323ad73d55f587e);
$parcel$export(module.exports, "DropdownMenuRadioItem", () => $d1bf075a6b218014$export$e4f69b41b1637536);
$parcel$export(module.exports, "DropdownMenuItemIndicator", () => $d1bf075a6b218014$export$42355ae145153fb6);
$parcel$export(module.exports, "DropdownMenuSeparator", () => $d1bf075a6b218014$export$da160178fd3bc7e9);
$parcel$export(module.exports, "DropdownMenuArrow", () => $d1bf075a6b218014$export$34b8980744021ec5);
$parcel$export(module.exports, "DropdownMenuSub", () => $d1bf075a6b218014$export$2f307d81a64f5442);
$parcel$export(module.exports, "DropdownMenuSubTrigger", () => $d1bf075a6b218014$export$21dcb7ec56f874cf);
$parcel$export(module.exports, "DropdownMenuSubContent", () => $d1bf075a6b218014$export$f34ec8bc2482cc5f);
$parcel$export(module.exports, "Root", () => $d1bf075a6b218014$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Trigger", () => $d1bf075a6b218014$export$41fb9f06171c75f4);
$parcel$export(module.exports, "Portal", () => $d1bf075a6b218014$export$602eac185826482c);
$parcel$export(module.exports, "Content", () => $d1bf075a6b218014$export$7c6e2c02157bb7d2);
$parcel$export(module.exports, "Group", () => $d1bf075a6b218014$export$eb2fcfdbd7ba97d4);
$parcel$export(module.exports, "Label", () => $d1bf075a6b218014$export$b04be29aa201d4f5);
$parcel$export(module.exports, "Item", () => $d1bf075a6b218014$export$6d08773d2e66f8f2);
$parcel$export(module.exports, "CheckboxItem", () => $d1bf075a6b218014$export$16ce288f89fa631c);
$parcel$export(module.exports, "RadioGroup", () => $d1bf075a6b218014$export$a98f0dcb43a68a25);
$parcel$export(module.exports, "RadioItem", () => $d1bf075a6b218014$export$371ab307eab489c0);
$parcel$export(module.exports, "ItemIndicator", () => $d1bf075a6b218014$export$c3468e2714d175fa);
$parcel$export(module.exports, "Separator", () => $d1bf075a6b218014$export$1ff3c3f08ae963c0);
$parcel$export(module.exports, "Arrow", () => $d1bf075a6b218014$export$21b07c8f274aebd5);
$parcel$export(module.exports, "Sub", () => $d1bf075a6b218014$export$d7a01e11500dfb6f);
$parcel$export(module.exports, "SubTrigger", () => $d1bf075a6b218014$export$2ea8a7a591ac5eac);
$parcel$export(module.exports, "SubContent", () => $d1bf075a6b218014$export$6d4de93b380beddf);










/* -------------------------------------------------------------------------------------------------
 * DropdownMenu
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$DROPDOWN_MENU_NAME = 'DropdownMenu';
const [$d1bf075a6b218014$var$createDropdownMenuContext, $d1bf075a6b218014$export$c0623cd925aeb687] = $7dQ7Q$radixuireactcontext.createContextScope($d1bf075a6b218014$var$DROPDOWN_MENU_NAME, [
    $7dQ7Q$radixuireactmenu.createMenuScope
]);
const $d1bf075a6b218014$var$useMenuScope = $7dQ7Q$radixuireactmenu.createMenuScope();
const [$d1bf075a6b218014$var$DropdownMenuProvider, $d1bf075a6b218014$var$useDropdownMenuContext] = $d1bf075a6b218014$var$createDropdownMenuContext($d1bf075a6b218014$var$DROPDOWN_MENU_NAME);
const $d1bf075a6b218014$export$e44a253a59704894 = (props)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , children: children , dir: dir , open: openProp , defaultOpen: defaultOpen , onOpenChange: onOpenChange , modal: modal = true  } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    const triggerRef = $7dQ7Q$react.useRef(null);
    const [open = false, setOpen] = $7dQ7Q$radixuireactusecontrollablestate.useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    return /*#__PURE__*/ $7dQ7Q$react.createElement($d1bf075a6b218014$var$DropdownMenuProvider, {
        scope: __scopeDropdownMenu,
        triggerId: $7dQ7Q$radixuireactid.useId(),
        triggerRef: triggerRef,
        contentId: $7dQ7Q$radixuireactid.useId(),
        open: open,
        onOpenChange: setOpen,
        onOpenToggle: $7dQ7Q$react.useCallback(()=>setOpen((prevOpen)=>!prevOpen
            )
        , [
            setOpen
        ]),
        modal: modal
    }, /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Root, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, {
        open: open,
        onOpenChange: setOpen,
        dir: dir,
        modal: modal
    }), children));
};
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$e44a253a59704894, {
    displayName: $d1bf075a6b218014$var$DROPDOWN_MENU_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuTrigger
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$TRIGGER_NAME = 'DropdownMenuTrigger';
const $d1bf075a6b218014$export$d2469213b3befba9 = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , disabled: disabled = false , ...triggerProps } = props;
    const context = $d1bf075a6b218014$var$useDropdownMenuContext($d1bf075a6b218014$var$TRIGGER_NAME, __scopeDropdownMenu);
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Anchor, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({
        asChild: true
    }, menuScope), /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({
        type: "button",
        id: context.triggerId,
        "aria-haspopup": "menu",
        "aria-expanded": context.open,
        "aria-controls": context.open ? context.contentId : undefined,
        "data-state": context.open ? 'open' : 'closed',
        "data-disabled": disabled ? '' : undefined,
        disabled: disabled
    }, triggerProps, {
        ref: $7dQ7Q$radixuireactcomposerefs.composeRefs(forwardedRef, context.triggerRef),
        onPointerDown: $7dQ7Q$radixuiprimitive.composeEventHandlers(props.onPointerDown, (event)=>{
            // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
            // but not when the control key is pressed (avoiding MacOS right click)
            if (!disabled && event.button === 0 && event.ctrlKey === false) {
                context.onOpenToggle(); // prevent trigger focusing when opening
                // this allows the content to be given focus without competition
                if (!context.open) event.preventDefault();
            }
        }),
        onKeyDown: $7dQ7Q$radixuiprimitive.composeEventHandlers(props.onKeyDown, (event)=>{
            if (disabled) return;
            if ([
                'Enter',
                ' '
            ].includes(event.key)) context.onOpenToggle();
            if (event.key === 'ArrowDown') context.onOpenChange(true); // prevent keydown from scrolling window / first focused item to execute
            // that keydown (inadvertently closing the menu)
            if ([
                'Enter',
                ' ',
                'ArrowDown'
            ].includes(event.key)) event.preventDefault();
        })
    })));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$d2469213b3befba9, {
    displayName: $d1bf075a6b218014$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuPortal
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$PORTAL_NAME = 'DropdownMenuPortal';
const $d1bf075a6b218014$export$cd369b4d4d54efc9 = (props)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...portalProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Portal, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, portalProps));
};
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$cd369b4d4d54efc9, {
    displayName: $d1bf075a6b218014$var$PORTAL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuContent
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$CONTENT_NAME = 'DropdownMenuContent';
const $d1bf075a6b218014$export$6e76d93a37c01248 = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...contentProps } = props;
    const context = $d1bf075a6b218014$var$useDropdownMenuContext($d1bf075a6b218014$var$CONTENT_NAME, __scopeDropdownMenu);
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    const hasInteractedOutsideRef = $7dQ7Q$react.useRef(false);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Content, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({
        id: context.contentId,
        "aria-labelledby": context.triggerId
    }, menuScope, contentProps, {
        ref: forwardedRef,
        onCloseAutoFocus: $7dQ7Q$radixuiprimitive.composeEventHandlers(props.onCloseAutoFocus, (event)=>{
            var _context$triggerRef$c;
            if (!hasInteractedOutsideRef.current) (_context$triggerRef$c = context.triggerRef.current) === null || _context$triggerRef$c === void 0 || _context$triggerRef$c.focus();
            hasInteractedOutsideRef.current = false; // Always prevent auto focus because we either focus manually or want user agent focus
            event.preventDefault();
        }),
        onInteractOutside: $7dQ7Q$radixuiprimitive.composeEventHandlers(props.onInteractOutside, (event)=>{
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (!context.modal || isRightClick) hasInteractedOutsideRef.current = true;
        }),
        style: {
            ...props.style,
            '--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
            '--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
            '--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
            '--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
            '--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)'
        }
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$6e76d93a37c01248, {
    displayName: $d1bf075a6b218014$var$CONTENT_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuGroup
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$GROUP_NAME = 'DropdownMenuGroup';
const $d1bf075a6b218014$export$246bebaba3a2f70e = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...groupProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Group, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, groupProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$246bebaba3a2f70e, {
    displayName: $d1bf075a6b218014$var$GROUP_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuLabel
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$LABEL_NAME = 'DropdownMenuLabel';
const $d1bf075a6b218014$export$76e48c5b57f24495 = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...labelProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Label, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, labelProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$76e48c5b57f24495, {
    displayName: $d1bf075a6b218014$var$LABEL_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuItem
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$ITEM_NAME = 'DropdownMenuItem';
const $d1bf075a6b218014$export$ed97964d1871885d = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...itemProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Item, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, itemProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$ed97964d1871885d, {
    displayName: $d1bf075a6b218014$var$ITEM_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuCheckboxItem
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$CHECKBOX_ITEM_NAME = 'DropdownMenuCheckboxItem';
const $d1bf075a6b218014$export$53a69729da201fa9 = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...checkboxItemProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.CheckboxItem, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, checkboxItemProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$53a69729da201fa9, {
    displayName: $d1bf075a6b218014$var$CHECKBOX_ITEM_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuRadioGroup
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$RADIO_GROUP_NAME = 'DropdownMenuRadioGroup';
const $d1bf075a6b218014$export$3323ad73d55f587e = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...radioGroupProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.RadioGroup, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, radioGroupProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$3323ad73d55f587e, {
    displayName: $d1bf075a6b218014$var$RADIO_GROUP_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuRadioItem
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$RADIO_ITEM_NAME = 'DropdownMenuRadioItem';
const $d1bf075a6b218014$export$e4f69b41b1637536 = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...radioItemProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.RadioItem, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, radioItemProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$e4f69b41b1637536, {
    displayName: $d1bf075a6b218014$var$RADIO_ITEM_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuItemIndicator
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$INDICATOR_NAME = 'DropdownMenuItemIndicator';
const $d1bf075a6b218014$export$42355ae145153fb6 = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...itemIndicatorProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.ItemIndicator, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, itemIndicatorProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$42355ae145153fb6, {
    displayName: $d1bf075a6b218014$var$INDICATOR_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuSeparator
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$SEPARATOR_NAME = 'DropdownMenuSeparator';
const $d1bf075a6b218014$export$da160178fd3bc7e9 = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...separatorProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Separator, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, separatorProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$da160178fd3bc7e9, {
    displayName: $d1bf075a6b218014$var$SEPARATOR_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuArrow
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$ARROW_NAME = 'DropdownMenuArrow';
const $d1bf075a6b218014$export$34b8980744021ec5 = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...arrowProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Arrow, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, arrowProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$34b8980744021ec5, {
    displayName: $d1bf075a6b218014$var$ARROW_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuSub
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$export$2f307d81a64f5442 = (props)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , children: children , open: openProp , onOpenChange: onOpenChange , defaultOpen: defaultOpen  } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    const [open = false, setOpen] = $7dQ7Q$radixuireactusecontrollablestate.useControllableState({
        prop: openProp,
        defaultProp: defaultOpen,
        onChange: onOpenChange
    });
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.Sub, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, {
        open: open,
        onOpenChange: setOpen
    }), children);
};
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuSubTrigger
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$SUB_TRIGGER_NAME = 'DropdownMenuSubTrigger';
const $d1bf075a6b218014$export$21dcb7ec56f874cf = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...subTriggerProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.SubTrigger, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, subTriggerProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$21dcb7ec56f874cf, {
    displayName: $d1bf075a6b218014$var$SUB_TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * DropdownMenuSubContent
 * -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$var$SUB_CONTENT_NAME = 'DropdownMenuSubContent';
const $d1bf075a6b218014$export$f34ec8bc2482cc5f = /*#__PURE__*/ $7dQ7Q$react.forwardRef((props, forwardedRef)=>{
    const { __scopeDropdownMenu: __scopeDropdownMenu , ...subContentProps } = props;
    const menuScope = $d1bf075a6b218014$var$useMenuScope(__scopeDropdownMenu);
    return /*#__PURE__*/ $7dQ7Q$react.createElement($7dQ7Q$radixuireactmenu.SubContent, ($parcel$interopDefault($7dQ7Q$babelruntimehelpersextends))({}, menuScope, subContentProps, {
        ref: forwardedRef,
        style: {
            ...props.style,
            '--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
            '--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
            '--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
            '--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
            '--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)'
        }
    }));
});
/*#__PURE__*/ Object.assign($d1bf075a6b218014$export$f34ec8bc2482cc5f, {
    displayName: $d1bf075a6b218014$var$SUB_CONTENT_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $d1bf075a6b218014$export$be92b6f5f03c0fe9 = $d1bf075a6b218014$export$e44a253a59704894;
const $d1bf075a6b218014$export$41fb9f06171c75f4 = $d1bf075a6b218014$export$d2469213b3befba9;
const $d1bf075a6b218014$export$602eac185826482c = $d1bf075a6b218014$export$cd369b4d4d54efc9;
const $d1bf075a6b218014$export$7c6e2c02157bb7d2 = $d1bf075a6b218014$export$6e76d93a37c01248;
const $d1bf075a6b218014$export$eb2fcfdbd7ba97d4 = $d1bf075a6b218014$export$246bebaba3a2f70e;
const $d1bf075a6b218014$export$b04be29aa201d4f5 = $d1bf075a6b218014$export$76e48c5b57f24495;
const $d1bf075a6b218014$export$6d08773d2e66f8f2 = $d1bf075a6b218014$export$ed97964d1871885d;
const $d1bf075a6b218014$export$16ce288f89fa631c = $d1bf075a6b218014$export$53a69729da201fa9;
const $d1bf075a6b218014$export$a98f0dcb43a68a25 = $d1bf075a6b218014$export$3323ad73d55f587e;
const $d1bf075a6b218014$export$371ab307eab489c0 = $d1bf075a6b218014$export$e4f69b41b1637536;
const $d1bf075a6b218014$export$c3468e2714d175fa = $d1bf075a6b218014$export$42355ae145153fb6;
const $d1bf075a6b218014$export$1ff3c3f08ae963c0 = $d1bf075a6b218014$export$da160178fd3bc7e9;
const $d1bf075a6b218014$export$21b07c8f274aebd5 = $d1bf075a6b218014$export$34b8980744021ec5;
const $d1bf075a6b218014$export$d7a01e11500dfb6f = $d1bf075a6b218014$export$2f307d81a64f5442;
const $d1bf075a6b218014$export$2ea8a7a591ac5eac = $d1bf075a6b218014$export$21dcb7ec56f874cf;
const $d1bf075a6b218014$export$6d4de93b380beddf = $d1bf075a6b218014$export$f34ec8bc2482cc5f;




//# sourceMappingURL=index.js.map
