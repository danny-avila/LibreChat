import { NativeDragSource } from './NativeDragSource.js'
import { nativeTypesConfig } from './nativeTypesConfig.js'

export function createNativeDragSource(
	type: string,
	dataTransfer?: DataTransfer,
): NativeDragSource {
	const config = nativeTypesConfig[type]
	if (!config) {
		throw new Error(`native type ${type} has no configuration`)
	}
	const result = new NativeDragSource(config)
	result.loadDataTransfer(dataTransfer)
	return result
}

export function matchNativeItemType(
	dataTransfer: DataTransfer | null,
): string | null {
	if (!dataTransfer) {
		return null
	}

	const dataTransferTypes = Array.prototype.slice.call(dataTransfer.types || [])
	return (
		Object.keys(nativeTypesConfig).filter((nativeItemType) => {
			const typeConfig = nativeTypesConfig[nativeItemType]
			if (!typeConfig?.matchesTypes) {
				return false
			}
			return typeConfig.matchesTypes.some(
				(t) => dataTransferTypes.indexOf(t) > -1,
			)
		})[0] || null
	)
}
