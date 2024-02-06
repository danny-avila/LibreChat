import $98Iye$babelruntimehelpersesmextends from "@babel/runtime/helpers/esm/extends";
import {forwardRef as $98Iye$forwardRef, createElement as $98Iye$createElement, useRef as $98Iye$useRef, useState as $98Iye$useState, useEffect as $98Iye$useEffect, useCallback as $98Iye$useCallback} from "react";
import {composeEventHandlers as $98Iye$composeEventHandlers} from "@radix-ui/primitive";
import {createCollection as $98Iye$createCollection} from "@radix-ui/react-collection";
import {useComposedRefs as $98Iye$useComposedRefs} from "@radix-ui/react-compose-refs";
import {createContextScope as $98Iye$createContextScope} from "@radix-ui/react-context";
import {useId as $98Iye$useId} from "@radix-ui/react-id";
import {Primitive as $98Iye$Primitive} from "@radix-ui/react-primitive";
import {useCallbackRef as $98Iye$useCallbackRef} from "@radix-ui/react-use-callback-ref";
import {useControllableState as $98Iye$useControllableState} from "@radix-ui/react-use-controllable-state";
import {useDirection as $98Iye$useDirection} from "@radix-ui/react-direction";












const $d7bdfb9eb0fdf311$var$ENTRY_FOCUS = 'rovingFocusGroup.onEntryFocus';
const $d7bdfb9eb0fdf311$var$EVENT_OPTIONS = {
    bubbles: false,
    cancelable: true
};
/* -------------------------------------------------------------------------------------------------
 * RovingFocusGroup
 * -----------------------------------------------------------------------------------------------*/ const $d7bdfb9eb0fdf311$var$GROUP_NAME = 'RovingFocusGroup';
const [$d7bdfb9eb0fdf311$var$Collection, $d7bdfb9eb0fdf311$var$useCollection, $d7bdfb9eb0fdf311$var$createCollectionScope] = $98Iye$createCollection($d7bdfb9eb0fdf311$var$GROUP_NAME);
const [$d7bdfb9eb0fdf311$var$createRovingFocusGroupContext, $d7bdfb9eb0fdf311$export$c7109489551a4f4] = $98Iye$createContextScope($d7bdfb9eb0fdf311$var$GROUP_NAME, [
    $d7bdfb9eb0fdf311$var$createCollectionScope
]);
const [$d7bdfb9eb0fdf311$var$RovingFocusProvider, $d7bdfb9eb0fdf311$var$useRovingFocusContext] = $d7bdfb9eb0fdf311$var$createRovingFocusGroupContext($d7bdfb9eb0fdf311$var$GROUP_NAME);
const $d7bdfb9eb0fdf311$export$8699f7c8af148338 = /*#__PURE__*/ $98Iye$forwardRef((props, forwardedRef)=>{
    return /*#__PURE__*/ $98Iye$createElement($d7bdfb9eb0fdf311$var$Collection.Provider, {
        scope: props.__scopeRovingFocusGroup
    }, /*#__PURE__*/ $98Iye$createElement($d7bdfb9eb0fdf311$var$Collection.Slot, {
        scope: props.__scopeRovingFocusGroup
    }, /*#__PURE__*/ $98Iye$createElement($d7bdfb9eb0fdf311$var$RovingFocusGroupImpl, $98Iye$babelruntimehelpersesmextends({}, props, {
        ref: forwardedRef
    }))));
});
/*#__PURE__*/ Object.assign($d7bdfb9eb0fdf311$export$8699f7c8af148338, {
    displayName: $d7bdfb9eb0fdf311$var$GROUP_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $d7bdfb9eb0fdf311$var$RovingFocusGroupImpl = /*#__PURE__*/ $98Iye$forwardRef((props, forwardedRef)=>{
    const { __scopeRovingFocusGroup: __scopeRovingFocusGroup , orientation: orientation , loop: loop = false , dir: dir , currentTabStopId: currentTabStopIdProp , defaultCurrentTabStopId: defaultCurrentTabStopId , onCurrentTabStopIdChange: onCurrentTabStopIdChange , onEntryFocus: onEntryFocus , ...groupProps } = props;
    const ref = $98Iye$useRef(null);
    const composedRefs = $98Iye$useComposedRefs(forwardedRef, ref);
    const direction = $98Iye$useDirection(dir);
    const [currentTabStopId = null, setCurrentTabStopId] = $98Iye$useControllableState({
        prop: currentTabStopIdProp,
        defaultProp: defaultCurrentTabStopId,
        onChange: onCurrentTabStopIdChange
    });
    const [isTabbingBackOut, setIsTabbingBackOut] = $98Iye$useState(false);
    const handleEntryFocus = $98Iye$useCallbackRef(onEntryFocus);
    const getItems = $d7bdfb9eb0fdf311$var$useCollection(__scopeRovingFocusGroup);
    const isClickFocusRef = $98Iye$useRef(false);
    const [focusableItemsCount, setFocusableItemsCount] = $98Iye$useState(0);
    $98Iye$useEffect(()=>{
        const node = ref.current;
        if (node) {
            node.addEventListener($d7bdfb9eb0fdf311$var$ENTRY_FOCUS, handleEntryFocus);
            return ()=>node.removeEventListener($d7bdfb9eb0fdf311$var$ENTRY_FOCUS, handleEntryFocus)
            ;
        }
    }, [
        handleEntryFocus
    ]);
    return /*#__PURE__*/ $98Iye$createElement($d7bdfb9eb0fdf311$var$RovingFocusProvider, {
        scope: __scopeRovingFocusGroup,
        orientation: orientation,
        dir: direction,
        loop: loop,
        currentTabStopId: currentTabStopId,
        onItemFocus: $98Iye$useCallback((tabStopId)=>setCurrentTabStopId(tabStopId)
        , [
            setCurrentTabStopId
        ]),
        onItemShiftTab: $98Iye$useCallback(()=>setIsTabbingBackOut(true)
        , []),
        onFocusableItemAdd: $98Iye$useCallback(()=>setFocusableItemsCount((prevCount)=>prevCount + 1
            )
        , []),
        onFocusableItemRemove: $98Iye$useCallback(()=>setFocusableItemsCount((prevCount)=>prevCount - 1
            )
        , [])
    }, /*#__PURE__*/ $98Iye$createElement($98Iye$Primitive.div, $98Iye$babelruntimehelpersesmextends({
        tabIndex: isTabbingBackOut || focusableItemsCount === 0 ? -1 : 0,
        "data-orientation": orientation
    }, groupProps, {
        ref: composedRefs,
        style: {
            outline: 'none',
            ...props.style
        },
        onMouseDown: $98Iye$composeEventHandlers(props.onMouseDown, ()=>{
            isClickFocusRef.current = true;
        }),
        onFocus: $98Iye$composeEventHandlers(props.onFocus, (event)=>{
            // We normally wouldn't need this check, because we already check
            // that the focus is on the current target and not bubbling to it.
            // We do this because Safari doesn't focus buttons when clicked, and
            // instead, the wrapper will get focused and not through a bubbling event.
            const isKeyboardFocus = !isClickFocusRef.current;
            if (event.target === event.currentTarget && isKeyboardFocus && !isTabbingBackOut) {
                const entryFocusEvent = new CustomEvent($d7bdfb9eb0fdf311$var$ENTRY_FOCUS, $d7bdfb9eb0fdf311$var$EVENT_OPTIONS);
                event.currentTarget.dispatchEvent(entryFocusEvent);
                if (!entryFocusEvent.defaultPrevented) {
                    const items = getItems().filter((item)=>item.focusable
                    );
                    const activeItem = items.find((item)=>item.active
                    );
                    const currentItem = items.find((item)=>item.id === currentTabStopId
                    );
                    const candidateItems = [
                        activeItem,
                        currentItem,
                        ...items
                    ].filter(Boolean);
                    const candidateNodes = candidateItems.map((item)=>item.ref.current
                    );
                    $d7bdfb9eb0fdf311$var$focusFirst(candidateNodes);
                }
            }
            isClickFocusRef.current = false;
        }),
        onBlur: $98Iye$composeEventHandlers(props.onBlur, ()=>setIsTabbingBackOut(false)
        )
    })));
});
/* -------------------------------------------------------------------------------------------------
 * RovingFocusGroupItem
 * -----------------------------------------------------------------------------------------------*/ const $d7bdfb9eb0fdf311$var$ITEM_NAME = 'RovingFocusGroupItem';
const $d7bdfb9eb0fdf311$export$ab9df7c53fe8454 = /*#__PURE__*/ $98Iye$forwardRef((props, forwardedRef)=>{
    const { __scopeRovingFocusGroup: __scopeRovingFocusGroup , focusable: focusable = true , active: active = false , tabStopId: tabStopId , ...itemProps } = props;
    const autoId = $98Iye$useId();
    const id = tabStopId || autoId;
    const context = $d7bdfb9eb0fdf311$var$useRovingFocusContext($d7bdfb9eb0fdf311$var$ITEM_NAME, __scopeRovingFocusGroup);
    const isCurrentTabStop = context.currentTabStopId === id;
    const getItems = $d7bdfb9eb0fdf311$var$useCollection(__scopeRovingFocusGroup);
    const { onFocusableItemAdd: onFocusableItemAdd , onFocusableItemRemove: onFocusableItemRemove  } = context;
    $98Iye$useEffect(()=>{
        if (focusable) {
            onFocusableItemAdd();
            return ()=>onFocusableItemRemove()
            ;
        }
    }, [
        focusable,
        onFocusableItemAdd,
        onFocusableItemRemove
    ]);
    return /*#__PURE__*/ $98Iye$createElement($d7bdfb9eb0fdf311$var$Collection.ItemSlot, {
        scope: __scopeRovingFocusGroup,
        id: id,
        focusable: focusable,
        active: active
    }, /*#__PURE__*/ $98Iye$createElement($98Iye$Primitive.span, $98Iye$babelruntimehelpersesmextends({
        tabIndex: isCurrentTabStop ? 0 : -1,
        "data-orientation": context.orientation
    }, itemProps, {
        ref: forwardedRef,
        onMouseDown: $98Iye$composeEventHandlers(props.onMouseDown, (event)=>{
            // We prevent focusing non-focusable items on `mousedown`.
            // Even though the item has tabIndex={-1}, that only means take it out of the tab order.
            if (!focusable) event.preventDefault(); // Safari doesn't focus a button when clicked so we run our logic on mousedown also
            else context.onItemFocus(id);
        }),
        onFocus: $98Iye$composeEventHandlers(props.onFocus, ()=>context.onItemFocus(id)
        ),
        onKeyDown: $98Iye$composeEventHandlers(props.onKeyDown, (event)=>{
            if (event.key === 'Tab' && event.shiftKey) {
                context.onItemShiftTab();
                return;
            }
            if (event.target !== event.currentTarget) return;
            const focusIntent = $d7bdfb9eb0fdf311$var$getFocusIntent(event, context.orientation, context.dir);
            if (focusIntent !== undefined) {
                event.preventDefault();
                const items = getItems().filter((item)=>item.focusable
                );
                let candidateNodes = items.map((item)=>item.ref.current
                );
                if (focusIntent === 'last') candidateNodes.reverse();
                else if (focusIntent === 'prev' || focusIntent === 'next') {
                    if (focusIntent === 'prev') candidateNodes.reverse();
                    const currentIndex = candidateNodes.indexOf(event.currentTarget);
                    candidateNodes = context.loop ? $d7bdfb9eb0fdf311$var$wrapArray(candidateNodes, currentIndex + 1) : candidateNodes.slice(currentIndex + 1);
                }
                /**
         * Imperative focus during keydown is risky so we prevent React's batching updates
         * to avoid potential bugs. See: https://github.com/facebook/react/issues/20332
         */ setTimeout(()=>$d7bdfb9eb0fdf311$var$focusFirst(candidateNodes)
                );
            }
        })
    })));
});
/*#__PURE__*/ Object.assign($d7bdfb9eb0fdf311$export$ab9df7c53fe8454, {
    displayName: $d7bdfb9eb0fdf311$var$ITEM_NAME
});
/* -----------------------------------------------------------------------------------------------*/ // prettier-ignore
const $d7bdfb9eb0fdf311$var$MAP_KEY_TO_FOCUS_INTENT = {
    ArrowLeft: 'prev',
    ArrowUp: 'prev',
    ArrowRight: 'next',
    ArrowDown: 'next',
    PageUp: 'first',
    Home: 'first',
    PageDown: 'last',
    End: 'last'
};
function $d7bdfb9eb0fdf311$var$getDirectionAwareKey(key, dir) {
    if (dir !== 'rtl') return key;
    return key === 'ArrowLeft' ? 'ArrowRight' : key === 'ArrowRight' ? 'ArrowLeft' : key;
}
function $d7bdfb9eb0fdf311$var$getFocusIntent(event, orientation, dir) {
    const key = $d7bdfb9eb0fdf311$var$getDirectionAwareKey(event.key, dir);
    if (orientation === 'vertical' && [
        'ArrowLeft',
        'ArrowRight'
    ].includes(key)) return undefined;
    if (orientation === 'horizontal' && [
        'ArrowUp',
        'ArrowDown'
    ].includes(key)) return undefined;
    return $d7bdfb9eb0fdf311$var$MAP_KEY_TO_FOCUS_INTENT[key];
}
function $d7bdfb9eb0fdf311$var$focusFirst(candidates) {
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
 */ function $d7bdfb9eb0fdf311$var$wrapArray(array, startIndex) {
    return array.map((_, index)=>array[(startIndex + index) % array.length]
    );
}
const $d7bdfb9eb0fdf311$export$be92b6f5f03c0fe9 = $d7bdfb9eb0fdf311$export$8699f7c8af148338;
const $d7bdfb9eb0fdf311$export$6d08773d2e66f8f2 = $d7bdfb9eb0fdf311$export$ab9df7c53fe8454;




export {$d7bdfb9eb0fdf311$export$c7109489551a4f4 as createRovingFocusGroupScope, $d7bdfb9eb0fdf311$export$8699f7c8af148338 as RovingFocusGroup, $d7bdfb9eb0fdf311$export$ab9df7c53fe8454 as RovingFocusGroupItem, $d7bdfb9eb0fdf311$export$be92b6f5f03c0fe9 as Root, $d7bdfb9eb0fdf311$export$6d08773d2e66f8f2 as Item};
//# sourceMappingURL=index.mjs.map
