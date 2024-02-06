var $buum9$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $buum9$react = require("react");
var $buum9$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $buum9$radixuireactprimitive = require("@radix-ui/react-primitive");
var $buum9$radixuireactusecallbackref = require("@radix-ui/react-use-callback-ref");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "FocusScope", () => $2bc01e66e04aa9ed$export$20e40289641fbbb6);
$parcel$export(module.exports, "Root", () => $2bc01e66e04aa9ed$export$be92b6f5f03c0fe9);





const $2bc01e66e04aa9ed$var$AUTOFOCUS_ON_MOUNT = 'focusScope.autoFocusOnMount';
const $2bc01e66e04aa9ed$var$AUTOFOCUS_ON_UNMOUNT = 'focusScope.autoFocusOnUnmount';
const $2bc01e66e04aa9ed$var$EVENT_OPTIONS = {
    bubbles: false,
    cancelable: true
};
/* -------------------------------------------------------------------------------------------------
 * FocusScope
 * -----------------------------------------------------------------------------------------------*/ const $2bc01e66e04aa9ed$var$FOCUS_SCOPE_NAME = 'FocusScope';
const $2bc01e66e04aa9ed$export$20e40289641fbbb6 = /*#__PURE__*/ $buum9$react.forwardRef((props, forwardedRef)=>{
    const { loop: loop = false , trapped: trapped = false , onMountAutoFocus: onMountAutoFocusProp , onUnmountAutoFocus: onUnmountAutoFocusProp , ...scopeProps } = props;
    const [container1, setContainer] = $buum9$react.useState(null);
    const onMountAutoFocus = $buum9$radixuireactusecallbackref.useCallbackRef(onMountAutoFocusProp);
    const onUnmountAutoFocus = $buum9$radixuireactusecallbackref.useCallbackRef(onUnmountAutoFocusProp);
    const lastFocusedElementRef = $buum9$react.useRef(null);
    const composedRefs = $buum9$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setContainer(node)
    );
    const focusScope = $buum9$react.useRef({
        paused: false,
        pause () {
            this.paused = true;
        },
        resume () {
            this.paused = false;
        }
    }).current; // Takes care of trapping focus if focus is moved outside programmatically for example
    $buum9$react.useEffect(()=>{
        if (trapped) {
            function handleFocusIn(event) {
                if (focusScope.paused || !container1) return;
                const target = event.target;
                if (container1.contains(target)) lastFocusedElementRef.current = target;
                else $2bc01e66e04aa9ed$var$focus(lastFocusedElementRef.current, {
                    select: true
                });
            }
            function handleFocusOut(event) {
                if (focusScope.paused || !container1) return;
                const relatedTarget = event.relatedTarget; // A `focusout` event with a `null` `relatedTarget` will happen in at least two cases:
                //
                // 1. When the user switches app/tabs/windows/the browser itself loses focus.
                // 2. In Google Chrome, when the focused element is removed from the DOM.
                //
                // We let the browser do its thing here because:
                //
                // 1. The browser already keeps a memory of what's focused for when the page gets refocused.
                // 2. In Google Chrome, if we try to focus the deleted focused element (as per below), it
                //    throws the CPU to 100%, so we avoid doing anything for this reason here too.
                if (relatedTarget === null) return; // If the focus has moved to an actual legitimate element (`relatedTarget !== null`)
                // that is outside the container, we move focus to the last valid focused element inside.
                if (!container1.contains(relatedTarget)) $2bc01e66e04aa9ed$var$focus(lastFocusedElementRef.current, {
                    select: true
                });
            } // When the focused element gets removed from the DOM, browsers move focus
            // back to the document.body. In this case, we move focus to the container
            // to keep focus trapped correctly.
            function handleMutations(mutations) {
                const focusedElement = document.activeElement;
                if (focusedElement !== document.body) return;
                for (const mutation of mutations)if (mutation.removedNodes.length > 0) $2bc01e66e04aa9ed$var$focus(container1);
            }
            document.addEventListener('focusin', handleFocusIn);
            document.addEventListener('focusout', handleFocusOut);
            const mutationObserver = new MutationObserver(handleMutations);
            if (container1) mutationObserver.observe(container1, {
                childList: true,
                subtree: true
            });
            return ()=>{
                document.removeEventListener('focusin', handleFocusIn);
                document.removeEventListener('focusout', handleFocusOut);
                mutationObserver.disconnect();
            };
        }
    }, [
        trapped,
        container1,
        focusScope.paused
    ]);
    $buum9$react.useEffect(()=>{
        if (container1) {
            $2bc01e66e04aa9ed$var$focusScopesStack.add(focusScope);
            const previouslyFocusedElement = document.activeElement;
            const hasFocusedCandidate = container1.contains(previouslyFocusedElement);
            if (!hasFocusedCandidate) {
                const mountEvent = new CustomEvent($2bc01e66e04aa9ed$var$AUTOFOCUS_ON_MOUNT, $2bc01e66e04aa9ed$var$EVENT_OPTIONS);
                container1.addEventListener($2bc01e66e04aa9ed$var$AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
                container1.dispatchEvent(mountEvent);
                if (!mountEvent.defaultPrevented) {
                    $2bc01e66e04aa9ed$var$focusFirst($2bc01e66e04aa9ed$var$removeLinks($2bc01e66e04aa9ed$var$getTabbableCandidates(container1)), {
                        select: true
                    });
                    if (document.activeElement === previouslyFocusedElement) $2bc01e66e04aa9ed$var$focus(container1);
                }
            }
            return ()=>{
                container1.removeEventListener($2bc01e66e04aa9ed$var$AUTOFOCUS_ON_MOUNT, onMountAutoFocus); // We hit a react bug (fixed in v17) with focusing in unmount.
                // We need to delay the focus a little to get around it for now.
                // See: https://github.com/facebook/react/issues/17894
                setTimeout(()=>{
                    const unmountEvent = new CustomEvent($2bc01e66e04aa9ed$var$AUTOFOCUS_ON_UNMOUNT, $2bc01e66e04aa9ed$var$EVENT_OPTIONS);
                    container1.addEventListener($2bc01e66e04aa9ed$var$AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
                    container1.dispatchEvent(unmountEvent);
                    if (!unmountEvent.defaultPrevented) $2bc01e66e04aa9ed$var$focus(previouslyFocusedElement !== null && previouslyFocusedElement !== void 0 ? previouslyFocusedElement : document.body, {
                        select: true
                    });
                     // we need to remove the listener after we `dispatchEvent`
                    container1.removeEventListener($2bc01e66e04aa9ed$var$AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
                    $2bc01e66e04aa9ed$var$focusScopesStack.remove(focusScope);
                }, 0);
            };
        }
    }, [
        container1,
        onMountAutoFocus,
        onUnmountAutoFocus,
        focusScope
    ]); // Takes care of looping focus (when tabbing whilst at the edges)
    const handleKeyDown = $buum9$react.useCallback((event)=>{
        if (!loop && !trapped) return;
        if (focusScope.paused) return;
        const isTabKey = event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;
        const focusedElement = document.activeElement;
        if (isTabKey && focusedElement) {
            const container = event.currentTarget;
            const [first, last] = $2bc01e66e04aa9ed$var$getTabbableEdges(container);
            const hasTabbableElementsInside = first && last; // we can only wrap focus if we have tabbable edges
            if (!hasTabbableElementsInside) {
                if (focusedElement === container) event.preventDefault();
            } else {
                if (!event.shiftKey && focusedElement === last) {
                    event.preventDefault();
                    if (loop) $2bc01e66e04aa9ed$var$focus(first, {
                        select: true
                    });
                } else if (event.shiftKey && focusedElement === first) {
                    event.preventDefault();
                    if (loop) $2bc01e66e04aa9ed$var$focus(last, {
                        select: true
                    });
                }
            }
        }
    }, [
        loop,
        trapped,
        focusScope.paused
    ]);
    return /*#__PURE__*/ $buum9$react.createElement($buum9$radixuireactprimitive.Primitive.div, ($parcel$interopDefault($buum9$babelruntimehelpersextends))({
        tabIndex: -1
    }, scopeProps, {
        ref: composedRefs,
        onKeyDown: handleKeyDown
    }));
});
/*#__PURE__*/ Object.assign($2bc01e66e04aa9ed$export$20e40289641fbbb6, {
    displayName: $2bc01e66e04aa9ed$var$FOCUS_SCOPE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * Utils
 * -----------------------------------------------------------------------------------------------*/ /**
 * Attempts focusing the first element in a list of candidates.
 * Stops when focus has actually moved.
 */ function $2bc01e66e04aa9ed$var$focusFirst(candidates, { select: select = false  } = {}) {
    const previouslyFocusedElement = document.activeElement;
    for (const candidate of candidates){
        $2bc01e66e04aa9ed$var$focus(candidate, {
            select: select
        });
        if (document.activeElement !== previouslyFocusedElement) return;
    }
}
/**
 * Returns the first and last tabbable elements inside a container.
 */ function $2bc01e66e04aa9ed$var$getTabbableEdges(container) {
    const candidates = $2bc01e66e04aa9ed$var$getTabbableCandidates(container);
    const first = $2bc01e66e04aa9ed$var$findVisible(candidates, container);
    const last = $2bc01e66e04aa9ed$var$findVisible(candidates.reverse(), container);
    return [
        first,
        last
    ];
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
 */ function $2bc01e66e04aa9ed$var$getTabbableCandidates(container) {
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
/**
 * Returns the first visible element in a list.
 * NOTE: Only checks visibility up to the `container`.
 */ function $2bc01e66e04aa9ed$var$findVisible(elements, container) {
    for (const element of elements){
        // we stop checking if it's hidden at the `container` level (excluding)
        if (!$2bc01e66e04aa9ed$var$isHidden(element, {
            upTo: container
        })) return element;
    }
}
function $2bc01e66e04aa9ed$var$isHidden(node, { upTo: upTo  }) {
    if (getComputedStyle(node).visibility === 'hidden') return true;
    while(node){
        // we stop at `upTo` (excluding it)
        if (upTo !== undefined && node === upTo) return false;
        if (getComputedStyle(node).display === 'none') return true;
        node = node.parentElement;
    }
    return false;
}
function $2bc01e66e04aa9ed$var$isSelectableInput(element) {
    return element instanceof HTMLInputElement && 'select' in element;
}
function $2bc01e66e04aa9ed$var$focus(element, { select: select = false  } = {}) {
    // only focus if that element is focusable
    if (element && element.focus) {
        const previouslyFocusedElement = document.activeElement; // NOTE: we prevent scrolling on focus, to minimize jarring transitions for users
        element.focus({
            preventScroll: true
        }); // only select if its not the same element, it supports selection and we need to select
        if (element !== previouslyFocusedElement && $2bc01e66e04aa9ed$var$isSelectableInput(element) && select) element.select();
    }
}
/* -------------------------------------------------------------------------------------------------
 * FocusScope stack
 * -----------------------------------------------------------------------------------------------*/ const $2bc01e66e04aa9ed$var$focusScopesStack = $2bc01e66e04aa9ed$var$createFocusScopesStack();
function $2bc01e66e04aa9ed$var$createFocusScopesStack() {
    /** A stack of focus scopes, with the active one at the top */ let stack = [];
    return {
        add (focusScope) {
            // pause the currently active focus scope (at the top of the stack)
            const activeFocusScope = stack[0];
            if (focusScope !== activeFocusScope) activeFocusScope === null || activeFocusScope === void 0 || activeFocusScope.pause();
             // remove in case it already exists (because we'll re-add it at the top of the stack)
            stack = $2bc01e66e04aa9ed$var$arrayRemove(stack, focusScope);
            stack.unshift(focusScope);
        },
        remove (focusScope) {
            var _stack$;
            stack = $2bc01e66e04aa9ed$var$arrayRemove(stack, focusScope);
            (_stack$ = stack[0]) === null || _stack$ === void 0 || _stack$.resume();
        }
    };
}
function $2bc01e66e04aa9ed$var$arrayRemove(array, item) {
    const updatedArray = [
        ...array
    ];
    const index = updatedArray.indexOf(item);
    if (index !== -1) updatedArray.splice(index, 1);
    return updatedArray;
}
function $2bc01e66e04aa9ed$var$removeLinks(items) {
    return items.filter((item)=>item.tagName !== 'A'
    );
}
const $2bc01e66e04aa9ed$export$be92b6f5f03c0fe9 = $2bc01e66e04aa9ed$export$20e40289641fbbb6;




//# sourceMappingURL=index.js.map
