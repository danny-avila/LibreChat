import $1IHzk$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {forwardRef as $1IHzk$forwardRef, createElement as $1IHzk$createElement, useRef as $1IHzk$useRef, useEffect as $1IHzk$useEffect} from "react";
import {composeEventHandlers as $1IHzk$composeEventHandlers} from "@radix-ui/primitive";
import {createContextScope as $1IHzk$createContextScope} from "@radix-ui/react-context";
import {createRovingFocusGroupScope as $1IHzk$createRovingFocusGroupScope, Root as $1IHzk$Root, Item as $1IHzk$Item} from "@radix-ui/react-roving-focus";
import {Presence as $1IHzk$Presence} from "@radix-ui/react-presence";
import {Primitive as $1IHzk$Primitive} from "@radix-ui/react-primitive";
import {useDirection as $1IHzk$useDirection} from "@radix-ui/react-direction";
import {useControllableState as $1IHzk$useControllableState} from "@radix-ui/react-use-controllable-state";
import {useId as $1IHzk$useId} from "@radix-ui/react-id";












/* -------------------------------------------------------------------------------------------------
 * Tabs
 * -----------------------------------------------------------------------------------------------*/ const $69cb30bb0017df05$var$TABS_NAME = 'Tabs';
const [$69cb30bb0017df05$var$createTabsContext, $69cb30bb0017df05$export$355f5bd209d7b13a] = $1IHzk$createContextScope($69cb30bb0017df05$var$TABS_NAME, [
    $1IHzk$createRovingFocusGroupScope
]);
const $69cb30bb0017df05$var$useRovingFocusGroupScope = $1IHzk$createRovingFocusGroupScope();
const [$69cb30bb0017df05$var$TabsProvider, $69cb30bb0017df05$var$useTabsContext] = $69cb30bb0017df05$var$createTabsContext($69cb30bb0017df05$var$TABS_NAME);
const $69cb30bb0017df05$export$b2539bed5023c21c = /*#__PURE__*/ $1IHzk$forwardRef((props, forwardedRef)=>{
    const { __scopeTabs: __scopeTabs , value: valueProp , onValueChange: onValueChange , defaultValue: defaultValue , orientation: orientation = 'horizontal' , dir: dir , activationMode: activationMode = 'automatic' , ...tabsProps } = props;
    const direction = $1IHzk$useDirection(dir);
    const [value, setValue] = $1IHzk$useControllableState({
        prop: valueProp,
        onChange: onValueChange,
        defaultProp: defaultValue
    });
    return /*#__PURE__*/ $1IHzk$createElement($69cb30bb0017df05$var$TabsProvider, {
        scope: __scopeTabs,
        baseId: $1IHzk$useId(),
        value: value,
        onValueChange: setValue,
        orientation: orientation,
        dir: direction,
        activationMode: activationMode
    }, /*#__PURE__*/ $1IHzk$createElement($1IHzk$Primitive.div, $1IHzk$babelruntimehelpersesmextends({
        dir: direction,
        "data-orientation": orientation
    }, tabsProps, {
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($69cb30bb0017df05$export$b2539bed5023c21c, {
    displayName: $69cb30bb0017df05$var$TABS_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TabsList
 * -----------------------------------------------------------------------------------------------*/ const $69cb30bb0017df05$var$TAB_LIST_NAME = 'TabsList';
const $69cb30bb0017df05$export$9712d22edc0d78c1 = /*#__PURE__*/ $1IHzk$forwardRef((props, forwardedRef)=>{
    const { __scopeTabs: __scopeTabs , loop: loop = true , ...listProps } = props;
    const context = $69cb30bb0017df05$var$useTabsContext($69cb30bb0017df05$var$TAB_LIST_NAME, __scopeTabs);
    const rovingFocusGroupScope = $69cb30bb0017df05$var$useRovingFocusGroupScope(__scopeTabs);
    return /*#__PURE__*/ $1IHzk$createElement($1IHzk$Root, $1IHzk$babelruntimehelpersesmextends({
        asChild: true
    }, rovingFocusGroupScope, {
        orientation: context.orientation,
        dir: context.dir,
        loop: loop
    }), /*#__PURE__*/ $1IHzk$createElement($1IHzk$Primitive.div, $1IHzk$babelruntimehelpersesmextends({
        role: "tablist",
        "aria-orientation": context.orientation
    }, listProps, {
        ref: forwardedRef
    })));
});
/*#__PURE__*/ Object.assign($69cb30bb0017df05$export$9712d22edc0d78c1, {
    displayName: $69cb30bb0017df05$var$TAB_LIST_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TabsTrigger
 * -----------------------------------------------------------------------------------------------*/ const $69cb30bb0017df05$var$TRIGGER_NAME = 'TabsTrigger';
const $69cb30bb0017df05$export$8114b9fdfdf9f3ba = /*#__PURE__*/ $1IHzk$forwardRef((props, forwardedRef)=>{
    const { __scopeTabs: __scopeTabs , value: value , disabled: disabled = false , ...triggerProps } = props;
    const context = $69cb30bb0017df05$var$useTabsContext($69cb30bb0017df05$var$TRIGGER_NAME, __scopeTabs);
    const rovingFocusGroupScope = $69cb30bb0017df05$var$useRovingFocusGroupScope(__scopeTabs);
    const triggerId = $69cb30bb0017df05$var$makeTriggerId(context.baseId, value);
    const contentId = $69cb30bb0017df05$var$makeContentId(context.baseId, value);
    const isSelected = value === context.value;
    return /*#__PURE__*/ $1IHzk$createElement($1IHzk$Item, $1IHzk$babelruntimehelpersesmextends({
        asChild: true
    }, rovingFocusGroupScope, {
        focusable: !disabled,
        active: isSelected
    }), /*#__PURE__*/ $1IHzk$createElement($1IHzk$Primitive.button, $1IHzk$babelruntimehelpersesmextends({
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
        onMouseDown: $1IHzk$composeEventHandlers(props.onMouseDown, (event)=>{
            // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
            // but not when the control key is pressed (avoiding MacOS right click)
            if (!disabled && event.button === 0 && event.ctrlKey === false) context.onValueChange(value);
            else // prevent focus to avoid accidental activation
            event.preventDefault();
        }),
        onKeyDown: $1IHzk$composeEventHandlers(props.onKeyDown, (event)=>{
            if ([
                ' ',
                'Enter'
            ].includes(event.key)) context.onValueChange(value);
        }),
        onFocus: $1IHzk$composeEventHandlers(props.onFocus, ()=>{
            // handle "automatic" activation if necessary
            // ie. activate tab following focus
            const isAutomaticActivation = context.activationMode !== 'manual';
            if (!isSelected && !disabled && isAutomaticActivation) context.onValueChange(value);
        })
    })));
});
/*#__PURE__*/ Object.assign($69cb30bb0017df05$export$8114b9fdfdf9f3ba, {
    displayName: $69cb30bb0017df05$var$TRIGGER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * TabsContent
 * -----------------------------------------------------------------------------------------------*/ const $69cb30bb0017df05$var$CONTENT_NAME = 'TabsContent';
const $69cb30bb0017df05$export$bd905d70e8fd2ebb = /*#__PURE__*/ $1IHzk$forwardRef((props, forwardedRef)=>{
    const { __scopeTabs: __scopeTabs , value: value , forceMount: forceMount , children: children , ...contentProps } = props;
    const context = $69cb30bb0017df05$var$useTabsContext($69cb30bb0017df05$var$CONTENT_NAME, __scopeTabs);
    const triggerId = $69cb30bb0017df05$var$makeTriggerId(context.baseId, value);
    const contentId = $69cb30bb0017df05$var$makeContentId(context.baseId, value);
    const isSelected = value === context.value;
    const isMountAnimationPreventedRef = $1IHzk$useRef(isSelected);
    $1IHzk$useEffect(()=>{
        const rAF = requestAnimationFrame(()=>isMountAnimationPreventedRef.current = false
        );
        return ()=>cancelAnimationFrame(rAF)
        ;
    }, []);
    return /*#__PURE__*/ $1IHzk$createElement($1IHzk$Presence, {
        present: forceMount || isSelected
    }, ({ present: present  })=>/*#__PURE__*/ $1IHzk$createElement($1IHzk$Primitive.div, $1IHzk$babelruntimehelpersesmextends({
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
/*#__PURE__*/ Object.assign($69cb30bb0017df05$export$bd905d70e8fd2ebb, {
    displayName: $69cb30bb0017df05$var$CONTENT_NAME
});
/* ---------------------------------------------------------------------------------------------- */ function $69cb30bb0017df05$var$makeTriggerId(baseId, value) {
    return `${baseId}-trigger-${value}`;
}
function $69cb30bb0017df05$var$makeContentId(baseId, value) {
    return `${baseId}-content-${value}`;
}
const $69cb30bb0017df05$export$be92b6f5f03c0fe9 = $69cb30bb0017df05$export$b2539bed5023c21c;
const $69cb30bb0017df05$export$54c2e3dc7acea9f5 = $69cb30bb0017df05$export$9712d22edc0d78c1;
const $69cb30bb0017df05$export$41fb9f06171c75f4 = $69cb30bb0017df05$export$8114b9fdfdf9f3ba;
const $69cb30bb0017df05$export$7c6e2c02157bb7d2 = $69cb30bb0017df05$export$bd905d70e8fd2ebb;




export {$69cb30bb0017df05$export$355f5bd209d7b13a as createTabsScope, $69cb30bb0017df05$export$b2539bed5023c21c as Tabs, $69cb30bb0017df05$export$9712d22edc0d78c1 as TabsList, $69cb30bb0017df05$export$8114b9fdfdf9f3ba as TabsTrigger, $69cb30bb0017df05$export$bd905d70e8fd2ebb as TabsContent, $69cb30bb0017df05$export$be92b6f5f03c0fe9 as Root, $69cb30bb0017df05$export$54c2e3dc7acea9f5 as List, $69cb30bb0017df05$export$41fb9f06171c75f4 as Trigger, $69cb30bb0017df05$export$7c6e2c02157bb7d2 as Content};
//# sourceMappingURL=index.mjs.map
