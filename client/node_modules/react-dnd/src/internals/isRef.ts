export interface Ref<T> {
	current: T
}

export function isRef(obj: unknown): boolean {
	return (
		// eslint-disable-next-line no-prototype-builtins
		obj !== null &&
		typeof obj === 'object' &&
		Object.prototype.hasOwnProperty.call(obj, 'current')
	)
}
