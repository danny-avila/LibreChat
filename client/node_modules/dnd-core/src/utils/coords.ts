import type { XYCoord } from '../interfaces.js'
import type { State } from '../reducers/dragOffset.js'

/**
 * Coordinate addition
 * @param a The first coordinate
 * @param b The second coordinate
 */
export function add(a: XYCoord, b: XYCoord): XYCoord {
	return {
		x: a.x + b.x,
		y: a.y + b.y,
	}
}

/**
 * Coordinate subtraction
 * @param a The first coordinate
 * @param b The second coordinate
 */
export function subtract(a: XYCoord, b: XYCoord): XYCoord {
	return {
		x: a.x - b.x,
		y: a.y - b.y,
	}
}

/**
 * Returns the cartesian distance of the drag source component's position, based on its position
 * at the time when the current drag operation has started, and the movement difference.
 *
 * Returns null if no item is being dragged.
 *
 * @param state The offset state to compute from
 */
export function getSourceClientOffset(state: State): XYCoord | null {
	const { clientOffset, initialClientOffset, initialSourceClientOffset } = state
	if (!clientOffset || !initialClientOffset || !initialSourceClientOffset) {
		return null
	}
	return subtract(
		add(clientOffset, initialSourceClientOffset),
		initialClientOffset,
	)
}

/**
 * Determines the x,y offset between the client offset and the initial client offset
 *
 * @param state The offset state to compute from
 */
export function getDifferenceFromInitialOffset(state: State): XYCoord | null {
	const { clientOffset, initialClientOffset } = state
	if (!clientOffset || !initialClientOffset) {
		return null
	}
	return subtract(clientOffset, initialClientOffset)
}
