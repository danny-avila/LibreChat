export function shallowEqual<T>(
	objA: T,
	objB: T,
	compare?: (a: T, b: T, key?: string) => boolean | void,
	compareContext?: any,
) {
	let compareResult = compare
		? compare.call(compareContext, objA, objB)
		: void 0
	if (compareResult !== void 0) {
		return !!compareResult
	}

	if (objA === objB) {
		return true
	}

	if (typeof objA !== 'object' || !objA || typeof objB !== 'object' || !objB) {
		return false
	}

	const keysA = Object.keys(objA)
	const keysB = Object.keys(objB)

	if (keysA.length !== keysB.length) {
		return false
	}

	const bHasOwnProperty = Object.prototype.hasOwnProperty.bind(objB)

	// Test for A's keys different from B.
	for (let idx = 0; idx < keysA.length; idx++) {
		const key = keysA[idx] as string

		if (!bHasOwnProperty(key)) {
			return false
		}

		const valueA = (objA as any)[key]
		const valueB = (objB as any)[key]

		compareResult = compare
			? compare.call(compareContext, valueA, valueB, key)
			: void 0

		if (
			compareResult === false ||
			(compareResult === void 0 && valueA !== valueB)
		) {
			return false
		}
	}

	return true
}
