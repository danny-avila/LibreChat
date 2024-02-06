import * as React from 'react';
import { RemoveScrollBar } from 'react-remove-scroll-bar';
import { styleSingleton } from 'react-style-singleton';
import { nonPassive } from './aggresiveCapture';
import { handleScroll, locationCouldBeScrolled } from './handleScroll';
export const getTouchXY = (event) => 'changedTouches' in event ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY] : [0, 0];
export const getDeltaXY = (event) => [event.deltaX, event.deltaY];
const extractRef = (ref) => ref && 'current' in ref ? ref.current : ref;
const deltaCompare = (x, y) => x[0] === y[0] && x[1] === y[1];
const generateStyle = (id) => `
  .block-interactivity-${id} {pointer-events: none;}
  .allow-interactivity-${id} {pointer-events: all;}
`;
let idCounter = 0;
let lockStack = [];
export function RemoveScrollSideCar(props) {
    const shouldPreventQueue = React.useRef([]);
    const touchStartRef = React.useRef([0, 0]);
    const activeAxis = React.useRef();
    const [id] = React.useState(idCounter++);
    const [Style] = React.useState(() => styleSingleton());
    const lastProps = React.useRef(props);
    React.useEffect(() => {
        lastProps.current = props;
    }, [props]);
    React.useEffect(() => {
        if (props.inert) {
            document.body.classList.add(`block-interactivity-${id}`);
            const allow = [props.lockRef.current, ...(props.shards || []).map(extractRef)].filter(Boolean);
            allow.forEach((el) => el.classList.add(`allow-interactivity-${id}`));
            return () => {
                document.body.classList.remove(`block-interactivity-${id}`);
                allow.forEach((el) => el.classList.remove(`allow-interactivity-${id}`));
            };
        }
        return;
    }, [props.inert, props.lockRef.current, props.shards]);
    const shouldCancelEvent = React.useCallback((event, parent) => {
        if ('touches' in event && event.touches.length === 2) {
            return !lastProps.current.allowPinchZoom;
        }
        const touch = getTouchXY(event);
        const touchStart = touchStartRef.current;
        const deltaX = 'deltaX' in event ? event.deltaX : touchStart[0] - touch[0];
        const deltaY = 'deltaY' in event ? event.deltaY : touchStart[1] - touch[1];
        let currentAxis;
        const target = event.target;
        const moveDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'h' : 'v';
        // allow horizontal touch move on Range inputs. They will not cause any scroll
        if ('touches' in event && moveDirection === 'h' && target.type === 'range') {
            return false;
        }
        let canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
        if (!canBeScrolledInMainDirection) {
            return true;
        }
        if (canBeScrolledInMainDirection) {
            currentAxis = moveDirection;
        }
        else {
            currentAxis = moveDirection === 'v' ? 'h' : 'v';
            canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
            // other axis might be not scrollable
        }
        if (!canBeScrolledInMainDirection) {
            return false;
        }
        if (!activeAxis.current && 'changedTouches' in event && (deltaX || deltaY)) {
            activeAxis.current = currentAxis;
        }
        if (!currentAxis) {
            return true;
        }
        const cancelingAxis = activeAxis.current || currentAxis;
        return handleScroll(cancelingAxis, parent, event, cancelingAxis === 'h' ? deltaX : deltaY, true);
    }, []);
    const shouldPrevent = React.useCallback((_event) => {
        const event = _event;
        if (!lockStack.length || lockStack[lockStack.length - 1] !== Style) {
            // not the last active
            return;
        }
        const delta = 'deltaY' in event ? getDeltaXY(event) : getTouchXY(event);
        const sourceEvent = shouldPreventQueue.current.filter((e) => e.name === event.type && e.target === event.target && deltaCompare(e.delta, delta))[0];
        // self event, and should be canceled
        if (sourceEvent && sourceEvent.should) {
            if (event.cancelable) {
                event.preventDefault();
            }
            return;
        }
        // outside or shard event
        if (!sourceEvent) {
            const shardNodes = (lastProps.current.shards || [])
                .map(extractRef)
                .filter(Boolean)
                .filter((node) => node.contains(event.target));
            const shouldStop = shardNodes.length > 0 ? shouldCancelEvent(event, shardNodes[0]) : !lastProps.current.noIsolation;
            if (shouldStop) {
                if (event.cancelable) {
                    event.preventDefault();
                }
            }
        }
    }, []);
    const shouldCancel = React.useCallback((name, delta, target, should) => {
        const event = { name, delta, target, should };
        shouldPreventQueue.current.push(event);
        setTimeout(() => {
            shouldPreventQueue.current = shouldPreventQueue.current.filter((e) => e !== event);
        }, 1);
    }, []);
    const scrollTouchStart = React.useCallback((event) => {
        touchStartRef.current = getTouchXY(event);
        activeAxis.current = undefined;
    }, []);
    const scrollWheel = React.useCallback((event) => {
        shouldCancel(event.type, getDeltaXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    const scrollTouchMove = React.useCallback((event) => {
        shouldCancel(event.type, getTouchXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    React.useEffect(() => {
        lockStack.push(Style);
        props.setCallbacks({
            onScrollCapture: scrollWheel,
            onWheelCapture: scrollWheel,
            onTouchMoveCapture: scrollTouchMove,
        });
        document.addEventListener('wheel', shouldPrevent, nonPassive);
        document.addEventListener('touchmove', shouldPrevent, nonPassive);
        document.addEventListener('touchstart', scrollTouchStart, nonPassive);
        return () => {
            lockStack = lockStack.filter((inst) => inst !== Style);
            document.removeEventListener('wheel', shouldPrevent, nonPassive);
            document.removeEventListener('touchmove', shouldPrevent, nonPassive);
            document.removeEventListener('touchstart', scrollTouchStart, nonPassive);
        };
    }, []);
    const { removeScrollBar, inert } = props;
    return (React.createElement(React.Fragment, null,
        inert ? React.createElement(Style, { styles: generateStyle(id) }) : null,
        removeScrollBar ? React.createElement(RemoveScrollBar, { gapMode: "margin" }) : null));
}
