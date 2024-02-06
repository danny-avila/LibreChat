import { intersection } from './js_utils.js'

export const NONE: string[] = []
export const ALL: string[] = []
// Add these flags for debug
;(NONE as any).__IS_NONE__ = true
;(ALL as any).__IS_ALL__ = true

/**
 * Determines if the given handler IDs are dirty or not.
 *
 * @param dirtyIds The set of dirty handler ids
 * @param handlerIds The set of handler ids to check
 */
export function areDirty(
	dirtyIds: string[],
	handlerIds: string[] | undefined,
): boolean {
	if (dirtyIds === NONE) {
		return false
	}

	if (dirtyIds === ALL || typeof handlerIds === 'undefined') {
		return true
	}

	const commonIds = intersection(handlerIds, dirtyIds)
	return commonIds.length > 0
}
