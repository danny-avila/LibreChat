/**
 * Observes an element's rectangle on screen (getBoundingClientRect)
 * This is useful to track elements on the screen and attach other elements
 * that might be in different layers, etc.
 */ function $0f3bbd680c63c15c$export$5a50ff2cde8c3802(/** The element whose rect to observe */ elementToObserve, /** The callback which will be called when the rect changes */ callback) {
    const observedData1 = $0f3bbd680c63c15c$var$observedElements.get(elementToObserve);
    if (observedData1 === undefined) {
        // add the element to the map of observed elements with its first callback
        // because this is the first time this element is observed
        $0f3bbd680c63c15c$var$observedElements.set(elementToObserve, {
            rect: {},
            callbacks: [
                callback
            ]
        });
        if ($0f3bbd680c63c15c$var$observedElements.size === 1) // start the internal loop once at least 1 element is observed
        $0f3bbd680c63c15c$var$rafId = requestAnimationFrame($0f3bbd680c63c15c$var$runLoop);
    } else {
        // only add a callback for this element as it's already observed
        observedData1.callbacks.push(callback);
        callback(elementToObserve.getBoundingClientRect());
    }
    return ()=>{
        const observedData = $0f3bbd680c63c15c$var$observedElements.get(elementToObserve);
        if (observedData === undefined) return; // start by removing the callback
        const index = observedData.callbacks.indexOf(callback);
        if (index > -1) observedData.callbacks.splice(index, 1);
        if (observedData.callbacks.length === 0) {
            // stop observing this element because there are no
            // callbacks registered for it anymore
            $0f3bbd680c63c15c$var$observedElements.delete(elementToObserve);
            if ($0f3bbd680c63c15c$var$observedElements.size === 0) // stop the internal loop once no elements are observed anymore
            cancelAnimationFrame($0f3bbd680c63c15c$var$rafId);
        }
    };
} // ========================================================================
// module internals
let $0f3bbd680c63c15c$var$rafId;
const $0f3bbd680c63c15c$var$observedElements = new Map();
function $0f3bbd680c63c15c$var$runLoop() {
    const changedRectsData = []; // process all DOM reads first (getBoundingClientRect)
    $0f3bbd680c63c15c$var$observedElements.forEach((data, element)=>{
        const newRect = element.getBoundingClientRect(); // gather all the data for elements whose rects have changed
        if (!$0f3bbd680c63c15c$var$rectEquals(data.rect, newRect)) {
            data.rect = newRect;
            changedRectsData.push(data);
        }
    }); // group DOM writes here after the DOM reads (getBoundingClientRect)
    // as DOM writes will most likely happen with the callbacks
    changedRectsData.forEach((data)=>{
        data.callbacks.forEach((callback)=>callback(data.rect)
        );
    });
    $0f3bbd680c63c15c$var$rafId = requestAnimationFrame($0f3bbd680c63c15c$var$runLoop);
} // ========================================================================
/**
 * Returns whether 2 rects are equal in values
 */ function $0f3bbd680c63c15c$var$rectEquals(rect1, rect2) {
    return rect1.width === rect2.width && rect1.height === rect2.height && rect1.top === rect2.top && rect1.right === rect2.right && rect1.bottom === rect2.bottom && rect1.left === rect2.left;
}




export {$0f3bbd680c63c15c$export$5a50ff2cde8c3802 as observeElementRect};
//# sourceMappingURL=index.mjs.map
