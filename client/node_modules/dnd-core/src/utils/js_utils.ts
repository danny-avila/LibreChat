// cheap lodash replacements

/**
 * drop-in replacement for _.get
 * @param obj
 * @param path
 * @param defaultValue
 */
export function get<T>(obj: any, path: string, defaultValue: T): T {
	return path
		.split('.')
		.reduce((a, c) => (a && a[c] ? a[c] : defaultValue || null), obj) as T
}

/**
 * drop-in replacement for _.without
 */
export function without<T>(items: T[], item: T): T[] {
	return items.filter((i) => i !== item)
}

/**
 * drop-in replacement for _.isString
 * @param input
 */
export function isString(input: any): boolean {
	return typeof input === 'string'
}

/**
 * drop-in replacement for _.isString
 * @param input
 */
export function isObject(input: any): boolean {
	return typeof input === 'object'
}

/**
 * replacement for _.xor
 * @param itemsA
 * @param itemsB
 */
export function xor<T extends string | number>(itemsA: T[], itemsB: T[]): T[] {
	const map = new Map<T, number>()
	const insertItem = (item: T) => {
		map.set(item, map.has(item) ? (map.get(item) as number) + 1 : 1)
	}
	itemsA.forEach(insertItem)
	itemsB.forEach(insertItem)

	const result: T[] = []
	map.forEach((count, key) => {
		if (count === 1) {
			result.push(key)
		}
	})
	return result
}

/**
 * replacement for _.intersection
 * @param itemsA
 * @param itemsB
 */
export function intersection<T>(itemsA: T[], itemsB: T[]): T[] {
	return itemsA.filter((t) => itemsB.indexOf(t) > -1)
}
