// cheap lodash replacements

export function memoize<T>(fn: () => T): () => T {
	let result: T | null = null
	const memoized = () => {
		if (result == null) {
			result = fn()
		}
		return result
	}
	return memoized
}

/**
 * drop-in replacement for _.without
 */
export function without<T>(items: T[], item: T) {
	return items.filter((i) => i !== item)
}

export function union<T extends string | number>(itemsA: T[], itemsB: T[]) {
	const set = new Set<T>()
	const insertItem = (item: T) => set.add(item)
	itemsA.forEach(insertItem)
	itemsB.forEach(insertItem)

	const result: T[] = []
	set.forEach((key) => result.push(key))
	return result
}
