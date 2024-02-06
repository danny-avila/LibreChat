import {
	BEGIN_DRAG,
	DROP,
	END_DRAG,
	HOVER,
	INIT_COORDS,
} from '../actions/dragDrop/index.js'
import type { Action, XYCoord } from '../interfaces.js'
import { areCoordsEqual } from '../utils/equality.js'

export interface State {
	initialSourceClientOffset: XYCoord | null
	initialClientOffset: XYCoord | null
	clientOffset: XYCoord | null
}

const initialState: State = {
	initialSourceClientOffset: null,
	initialClientOffset: null,
	clientOffset: null,
}

export function reduce(
	state: State = initialState,
	action: Action<{
		sourceClientOffset: XYCoord
		clientOffset: XYCoord
	}>,
): State {
	const { payload } = action
	switch (action.type) {
		case INIT_COORDS:
		case BEGIN_DRAG:
			return {
				initialSourceClientOffset: payload.sourceClientOffset,
				initialClientOffset: payload.clientOffset,
				clientOffset: payload.clientOffset,
			}
		case HOVER:
			if (areCoordsEqual(state.clientOffset, payload.clientOffset)) {
				return state
			}
			return {
				...state,
				clientOffset: payload.clientOffset,
			}
		case END_DRAG:
		case DROP:
			return initialState
		default:
			return state
	}
}
