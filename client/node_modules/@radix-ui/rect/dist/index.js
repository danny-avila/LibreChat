function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}

$parcel$export(module.exports, "observeElementRect", () => $f98399f7d3345a24$export$5a50ff2cde8c3802);
/**
 * Observes an element's rectangle on screen (getBoundingClientRect)
 * This is useful to track elements on the screen and attach other elements
 * that might be in different layers, etc.
 */ function $f98399f7d3345a24$export$5a50ff2cde8c3802(/** The element whose rect to observe */ elementToObserve, /** The callback which will be called when the rect changes */ callback) {
    const observedData1 = $f98399f7d3345a24$var$observedElements.get(elementToObserve);
    if (observedData1 === undefined) {
        // add the element to the map of observed elements with its first callback
        // because this is the first time this element is observed
        $f98399f7d3345a24$var$observedElements.set(elementToObserve, {
            rect: {},
            callbacks: [
                callback
            ]
        });
        if ($f98399f7d3345a24$var$observedElements.size === 1) // start the internal loop once at least 1 element is observed
        $f98399f7d3345a24$var$rafId = requestAnimationFrame($f98399f7d3345a24$var$runLoop);
    } else {
        // only add a callback for this element as it's already observed
        observedData1.callbacks.push(callback);
        callback(elementToObserve.getBoundingClientRect());
    }
    return ()=>{
        const observedData = $f98399f7d3345a24$var$observedElements.get(elementToObserve);
        if (observedData === undefined) return; // start by removing the callback
        const index = observedData.callbacks.indexOf(callback);
        if (index > -1) observedData.callbacks.splice(index, 1);
        if (observedData.callbacks.length === 0) {
            // stop observing this element because there are no
            // callbacks registered for it anymore
            $f98399f7d3345a24$var$observedElements.delete(elementToObserve);
            if ($f98399f7d3345a24$var$observedElements.size === 0) // stop the internal loop once no elements are observed anymore
            cancelAnimationFrame($f98399f7d3345a24$var$rafId);
        }
    };
} // ========================================================================
// module internals
let $f98399f7d3345a24$var$rafId;
const $f98399f7d3345a24$var$observedElements = new Map();
function $f98399f7d3345a24$var$runLoop() {
    const changedRectsData = []; // process all DOM reads first (getBoundingClientRect)
    $f98399f7d3345a24$var$observedElements.forEach((data, element)=>{
        const newRect = element.getBoundingClientRect(); // gather all the data for elements whose rects have changed
        if (!$f98399f7d3345a24$var$rectEquals(data.rect, newRect)) {
            data.rect = newRect;
            changedRectsData.push(data);
        }
    }); // group DOM writes here after the DOM reads (getBoundingClientRect)
    // as DOM writes will most likely happen with the callbacks
    changedRectsData.forEach((data)=>{
        data.callbacks.forEach((callback)=>callback(data.rect)
        );
    });
    $f98399f7d3345a24$var$rafId = requestAnimationFrame($f98399f7d3345a24$var$runLoop);
} // ========================================================================
/**
 * Returns whether 2 rects are equal in values
 */ function $f98399f7d3345a24$var$rectEquals(rect1, rect2) {
    return rect1.width === rect2.width && rect1.height === rect2.height && rect1.top === rect2.top && rect1.right === rect2.right && rect1.bottom === rect2.bottom && rect1.left === rect2.left;
}




//# sourceMappingURL=index.js.map
