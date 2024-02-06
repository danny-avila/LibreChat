import type { Identifier } from '../interfaces.js'

export function matchesType(
	targetType: Identifier | Identifier[] | null,
	draggedItemType: Identifier | null,
): boolean {
	if (draggedItemType === null) {
		return targetType === null
	}
	return Array.isArray(targetType)
		? (targetType as Identifier[]).some((t) => t === draggedItemType)
		: targetType === draggedItemType
}
