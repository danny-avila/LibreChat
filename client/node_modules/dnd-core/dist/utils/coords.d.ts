import type { XYCoord } from '../interfaces.js';
import type { State } from '../reducers/dragOffset.js';
/**
 * Coordinate addition
 * @param a The first coordinate
 * @param b The second coordinate
 */
export declare function add(a: XYCoord, b: XYCoord): XYCoord;
/**
 * Coordinate subtraction
 * @param a The first coordinate
 * @param b The second coordinate
 */
export declare function subtract(a: XYCoord, b: XYCoord): XYCoord;
/**
 * Returns the cartesian distance of the drag source component's position, based on its position
 * at the time when the current drag operation has started, and the movement difference.
 *
 * Returns null if no item is being dragged.
 *
 * @param state The offset state to compute from
 */
export declare function getSourceClientOffset(state: State): XYCoord | null;
/**
 * Determines the x,y offset between the client offset and the initial client offset
 *
 * @param state The offset state to compute from
 */
export declare function getDifferenceFromInitialOffset(state: State): XYCoord | null;
