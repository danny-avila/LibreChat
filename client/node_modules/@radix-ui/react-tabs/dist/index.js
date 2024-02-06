var $8oLOM$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $8oLOM$react = require("react");
var $8oLOM$radixuiprimitive = require("@radix-ui/primitive");
var $8oLOM$radixuireactcontext = require("@radix-ui/react-context");
var $8oLOM$radixuireactrovingfocus = require("@radix-ui/react-roving-focus");
var $8oLOM$radixuireactpresence = require("@radix-ui/react-presence");
var $8oLOM$radixuireactprimitive = require("@radix-ui/react-primitive");
var $8oLOM$radixuireactdirection = require("@radix-ui/react-direction");
var $8oLOM$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $8oLOM$radixuireactid = require("@radix-ui/react-id");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createTabsScope", () => $2bbff03427f8eaee$export$355f5bd209d7b13a);
$parcel$export(module.exports, "Tabs", () => $2bbff03427f8eaee$export$b2539bed5023c21c);
$parcel$export(module.exports, "TabsList", () => $2bbff03427f8eaee$export$9712d22edc0d78c1);
$parcel$export(module.exports, "TabsTrigger", () => $2bbff03427f8eaee$export$8114b9fdfdf9f3ba);
$parcel$export(module.exports, "TabsContent", () => $2bbff03427f8eaee$export$bd905d70e8fd2ebb);
$parcel$export(module.exports, "Root", () => $2bbff03427f8eaee$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "List", () => $2bbff03427f8eaee$export$54c2e3dc7acea9f5);
$parcel$export(module.exports, "Trigger", () => $2bbff03427f8eaee$export$41fb9f06171c75f4);
$parcel$export(module.exports, "Content", () => $2bbff03427f8eaee$export$7c6e2c02157bb7d2);











/* -------------------------------------------------------------------------------------------------
 * Tabs
 * -----------------------------------------------------------------------------------------------*/ const $2bbff03427f8eaee$var$TABS_NAME = 'Tabs';
const [$2bbff03427f8eaee$var$createTabsContext, $2bbff03427f8eaee$export$355f5bd209d7b13a] = $8oLOM$radixuireactcontext.createContextScope($2bbff03427f8eaee$var$TABS_NAME, [
    $8oLOM$radixuireactrovingfocus.createRovingFocusGroupScope
]);
const $2bbff03427f8eaee$var$useRovingFocusGroupScope = $8oLOM$radixuireactrovingfocus.createRovingFocusGroupScope();
const [$2bbff03427f8eaee$var$TabsProvider, $2bbff03427f8eaee$var$useTabsContext] = $2bbff03427f8eaee$var$createTabsContext($2bbff03427f8eaee$var$TABS_NAME);
const $2bbff03427f8eaee$export$b2539bed5023c21c = /*#__PURE__*/ $8oLOM$react.forwardRef((props, forwardedRef)=>{
    const { __scopeTabs: __scopeTabs , value: valueProp , onValueChange: onValueChange , defaultValue: defaultValue , orientation: orientation = 'horizontal' , dir: dir , activationMode: activationMode = 'automatic' , ...tabsProps } = props;
    const direction = $8oLOM$radixuireactdirection.useDirection(dir);
    const [value, setValue] = $8oLOM$radixuireactusecontrollablestate.useControllableState({
        prop: valueProp,
        onChange: onValueChange,
        defaultProp: defaultValue
    });
    return /*#__PURE__*/ $8oLOM$react.createElement($2bbff03427f8eaee$var$TabsProvider, {
        scope: __scopeTabs,
        baseId: $8oLOM$radixuireactid.useId(),
        value: value,
        onValueChange: setValue,
        orientation: orientation,
        dir: direction,
        activationMode: activationMode
    }, /*#__PURE__*/ $8oLOM$react.createElement($8oLOM$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($8oLOM$babelruntimehelpersextends))({
        dir: direction,
        "data-orientation": orientation
    }, tabsProps, {
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($2bbff03427f8eaee$export$b2539bed5023c21c, {
    displayName: $2bbff03427f8eaee$var$TABS_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TabsList
 * -----------------------------------------------------------------------------------------------*/ const $2bbff03427f8eaee$var$TAB_LIST_NAME = 'TabsList';
const $2bbff03427f8eaee$export$9712d22edc0d78c1 = /*#__PURE__*/ $8oLOM$react.forwardRef((props, forwardedRef)=>{
    const { __scopeTabs: __scopeTabs , loop: loop = true , ...listProps } = props;
    const context = $2bbff03427f8eaee$var$useTabsContext($2bbff03427f8eaee$var$TAB_LIST_NAME, __scopeTabs);
    const rovingFocusGroupScope = $2bbff03427f8eaee$var$useRovingFocusGroupScope(__scopeTabs);
    return /*#__PURE__*/ $8oLOM$react.createElement($8oLOM$radixuireactrovingfocus.Root, ($parcel$interopDefault($8oLOM$babelruntimehelpersextends))({
        asChild: true
    }, rovingFocusGroupScope, {
        orientation: context.orientation,
        dir: context.dir,
        loop: loop
    }), /*#__PURE__*/ $8oLOM$react.createElement($8oLOM$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($8oLOM$babelruntimehelpersextends))({
        role: "tablist",
        "aria-orientation": context.orientation
    }, listProps, {
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($2bbff03427f8eaee$export$9712d22edc0d78c1, {
    displayName: $2bbff03427f8eaee$var$TAB_LIST_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TabsTrigger
 * -----------------------------------------------------------------------------------------------*/ const $2bbff03427f8eaee$var$TRIGGER_NAME = 'TabsTrigger';
const $2bbff03427f8eaee$export$8114b9fdfdf9f3ba = /*#__PURE__*/ $8oLOM$react.forwardRef((props, forwardedRef)=>{
    const { __scopeTabs: __scopeTabs , value: value , disabled: disabled = false , ...triggerProps } = props;
    const context = $2bbff03427f8eaee$var$useTabsContext($2bbff03427f8eaee$var$TRIGGER_NAME, __scopeTabs);
    const rovingFocusGroupScope = $2bbff03427f8eaee$var$useRovingFocusGroupScope(__scopeTabs);
    const triggerId = $2bbff03427f8eaee$var$makeTriggerId(context.baseId, value);
    const contentId = $2bbff03427f8eaee$var$makeContentId(context.baseId, value);
    const isSelected = value === context.value;
    return /*#__PURE__*/ $8oLOM$react.createElement($8oLOM$radixuireactrovingfocus.Item, ($parcel$interopDefault($8oLOM$babelruntimehelpersextends))({
        asChild: true
    }, rovingFocusGroupScope, {
        focusable: !disabled,
        active: isSelected
    }), /*#__PURE__*/ $8oLOM$react.createElement($8oLOM$radixuireactprimitive.Primitive.button, ($parcel$interopDefault($8oLOM$babelruntimehelpersextends))({
        type: "button",
        role: "tab",
        "aria-selected": isSelected,
        "aria-controls": contentId,
        "data-state": isSelected ? 'active' : 'inactive',
        "data-disabled": disabled ? '' : undefined,
        disabled: disabled,
        id: triggerId
    }, triggerProps, {
        ref: forwardedRef,
        onMouseDown: $8oLOM$radixuiprimitive.composeEventHandlers(props.onMouseDown, (event)=>{
            // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
            // but not when the control key is pressed (avoiding MacOS right click)
            if (!disabled && event.button === 0 && event.ctrlKey === false) context.onValueChange(value);
            else // prevent focus to avoid accidental activation
            event.preventDefault();
        }),
        onKeyDown: $8oLOM$radixuiprimitive.composeEventHandlers(props.onKeyDown, (event)=>{
            if ([
                ' ',
                'Enter'
            ].includes(event.key)) context.onValueChange(value);
        }),
        onFocus: $8oLOM$radixuiprimitive.composeEventHandlers(props.onFocus, ()=>{
            // handle "automatic" activation if necessary
            // ie. activate tab following focus
            const isAutomaticActivation = context.activationMode !== 'manual';
            if (!isSelected && !disabled && isAutomaticActivation) context.onValueChange(value);
        })
    })));
});
/*#__PURE__*/ Object.assign($2bbff03427f8eaee$export$8114b9fdfdf9f3ba, {
    displayName: $2bbff03427f8eaee$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TabsContent
 * -----------------------------------------------------------------------------------------------*/ const $2bbff03427f8eaee$var$CONTENT_NAME = 'TabsContent';
const $2bbff03427f8eaee$export$bd905d70e8fd2ebb = /*#__PURE__*/ $8oLOM$react.forwardRef((props, forwardedRef)=>{
    const { __scopeTabs: __scopeTabs , value: value , forceMount: forceMount , children: children , ...contentProps } = props;
    const context = $2bbff03427f8eaee$var$useTabsContext($2bbff03427f8eaee$var$CONTENT_NAME, __scopeTabs);
    const triggerId = $2bbff03427f8eaee$var$makeTriggerId(context.baseId, value);
    const contentId = $2bbff03427f8eaee$var$makeContentId(context.baseId, value);
    const isSelected = value === context.value;
    const isMountAnimationPreventedRef = $8oLOM$react.useRef(isSelected);
    $8oLOM$react.useEffect(()=>{
        const rAF = requestAnimationFrame(()=>isMountAnimationPreventedRef.current = false
        );
        return ()=>cancelAnimationFrame(rAF)
        ;
    }, []);
    return /*#__PURE__*/ $8oLOM$react.createElement($8oLOM$radixuireactpresence.Presence, {
        present: forceMount || isSelected
    }, ({ present: present  })=>/*#__PURE__*/ $8oLOM$react.createElement($8oLOM$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($8oLOM$babelruntimehelpersextends))({
            "data-state": isSelected ? 'active' : 'inactive',
            "data-orientation": context.orientation,
            role: "tabpanel",
            "aria-labelledby": triggerId,
            hidden: !present,
            id: contentId,
            tabIndex: 0
        }, contentProps, {
            ref: forwardedRef,
            style: {
                ...props.style,
                animationDuration: isMountAnimationPreventedRef.current ? '0s' : undefined
            }
        }), present && children)
    );
});
/*#__PURE__*/ Object.assign($2bbff03427f8eaee$export$bd905d70e8fd2ebb, {
    displayName: $2bbff03427f8eaee$var$CONTENT_NAME
});
/* ---------------------------------------------------------------------------------------------- */ function $2bbff03427f8eaee$var$makeTriggerId(baseId, value) {
    return `${baseId}-trigger-${value}`;
}
function $2bbff03427f8eaee$var$makeContentId(baseId, value) {
    return `${baseId}-content-${value}`;
}
const $2bbff03427f8eaee$export$be92b6f5f03c0fe9 = $2bbff03427f8eaee$export$b2539bed5023c21c;
const $2bbff03427f8eaee$export$54c2e3dc7acea9f5 = $2bbff03427f8eaee$export$9712d22edc0d78c1;
const $2bbff03427f8eaee$export$41fb9f06171c75f4 = $2bbff03427f8eaee$export$8114b9fdfdf9f3ba;
const $2bbff03427f8eaee$export$7c6e2c02157bb7d2 = $2bbff03427f8eaee$export$bd905d70e8fd2ebb;




//# sourceMappingURL=index.js.map
