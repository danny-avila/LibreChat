const alwaysContainsScroll = (node) => 
// textarea will always _contain_ scroll inside self. It only can be hidden
node.tagName === 'TEXTAREA';
const elementCanBeScrolled = (node, overflow) => {
    const styles = window.getComputedStyle(node);
    return (
    // not-not-scrollable
    styles[overflow] !== 'hidden' &&
        // contains scroll inside self
        !(styles.overflowY === styles.overflowX && !alwaysContainsScroll(node) && styles[overflow] === 'visible'));
};
const elementCouldBeVScrolled = (node) => elementCanBeScrolled(node, 'overflowY');
const elementCouldBeHScrolled = (node) => elementCanBeScrolled(node, 'overflowX');
export const locationCouldBeScrolled = (axis, node) => {
    let current = node;
    do {
        // Skip over shadow root
        if (typeof ShadowRoot !== 'undefined' && current instanceof ShadowRoot) {
            current = current.host;
        }
        const isScrollable = elementCouldBeScrolled(axis, current);
        if (isScrollable) {
            const [, s, d] = getScrollVariables(axis, current);
            if (s > d) {
                return true;
            }
        }
        current = current.parentNode;
    } while (current && current !== document.body);
    return false;
};
const getVScrollVariables = ({ scrollTop, scrollHeight, clientHeight }) => [
    scrollTop,
    scrollHeight,
    clientHeight,
];
const getHScrollVariables = ({ scrollLeft, scrollWidth, clientWidth }) => [
    scrollLeft,
    scrollWidth,
    clientWidth,
];
const elementCouldBeScrolled = (axis, node) => axis === 'v' ? elementCouldBeVScrolled(node) : elementCouldBeHScrolled(node);
const getScrollVariables = (axis, node) => axis === 'v' ? getVScrollVariables(node) : getHScrollVariables(node);
const getDirectionFactor = (axis, direction) => 
/**
 * If the element's direction is rtl (right-to-left), then scrollLeft is 0 when the scrollbar is at its rightmost position,
 * and then increasingly negative as you scroll towards the end of the content.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollLeft
 */
axis === 'h' && direction === 'rtl' ? -1 : 1;
export const handleScroll = (axis, endTarget, event, sourceDelta, noOverscroll) => {
    const directionFactor = getDirectionFactor(axis, window.getComputedStyle(endTarget).direction);
    const delta = directionFactor * sourceDelta;
    // find scrollable target
    let target = event.target;
    const targetInLock = endTarget.contains(target);
    let shouldCancelScroll = false;
    const isDeltaPositive = delta > 0;
    let availableScroll = 0;
    let availableScrollTop = 0;
    do {
        const [position, scroll, capacity] = getScrollVariables(axis, target);
        const elementScroll = scroll - capacity - directionFactor * position;
        if (position || elementScroll) {
            if (elementCouldBeScrolled(axis, target)) {
                availableScroll += elementScroll;
                availableScrollTop += position;
            }
        }
        target = target.parentNode;
    } while (
    // portaled content
    (!targetInLock && target !== document.body) ||
        // self content
        (targetInLock && (endTarget.contains(target) || endTarget === target)));
    if (isDeltaPositive && ((noOverscroll && availableScroll === 0) || (!noOverscroll && delta > availableScroll))) {
        shouldCancelScroll = true;
    }
    else if (!isDeltaPositive &&
        ((noOverscroll && availableScrollTop === 0) || (!noOverscroll && -delta > availableScrollTop))) {
        shouldCancelScroll = true;
    }
    return shouldCancelScroll;
};
