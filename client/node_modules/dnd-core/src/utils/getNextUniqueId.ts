let nextUniqueId = 0

export function getNextUniqueId(): number {
	return nextUniqueId++
}
