import { useMemo } from 'react'

import type { FactoryOrInstance } from './types.js'

export function useOptionalFactory<T>(
	arg: FactoryOrInstance<T>,
	deps?: unknown[],
): T {
	const memoDeps = [...(deps || [])]
	if (deps == null && typeof arg !== 'function') {
		memoDeps.push(arg)
	}
	return useMemo<T>(() => {
		return typeof arg === 'function' ? (arg as () => T)() : (arg as T)
	}, memoDeps)
}
