import type { AnyAction } from 'redux'

import type { XYCoord } from '../../../interfaces.js'
import { INIT_COORDS } from '../types.js'

export function setClientOffset(
	clientOffset: XYCoord | null | undefined,
	sourceClientOffset?: XYCoord | null | undefined,
): AnyAction {
	return {
		type: INIT_COORDS,
		payload: {
			sourceClientOffset: sourceClientOffset || null,
			clientOffset: clientOffset || null,
		},
	}
}
