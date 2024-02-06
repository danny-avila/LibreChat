"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createCanvasEvent;
/**
 * This function returns a CanvasRenderingContext2DEvent. Whenever an operation would modify the canvas
 * context, this function should be used to generate an "event" that represents that sort of modification.
 * This will be used to mock for snapshots.
 *
 * @example
 * interface CanvasRenderingContext2DEvent {
 *   type: string;
 *   transform: [number, number, number, number, number, number]; // the resulting current transform
 *   props: {
 *     // if the event is a property was set, `event.props.value` would be set
 *     [propName: string]: any;
 *   };
 * }
 */
function createCanvasEvent(type, transform, props) {
  return {
    type,
    transform,
    props
  };
}