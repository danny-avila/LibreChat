import { Config } from './types'

/**
 * @param baseConfig Config where other config will be merged into. This object will be mutated.
 * @param configExtension Partial config to merge into the `baseConfig`.
 */
export function mergeConfigs(baseConfig: Config, configExtension: Partial<Config>) {
    for (const key in configExtension) {
        mergePropertyRecursively(baseConfig as any, key, configExtension[key as keyof Config])
    }

    return baseConfig
}

const hasOwnProperty = Object.prototype.hasOwnProperty
const overrideTypes = new Set(['string', 'number', 'boolean'])

function mergePropertyRecursively(
    baseObject: Record<string, unknown>,
    mergeKey: string,
    mergeValue: unknown,
) {
    if (
        !hasOwnProperty.call(baseObject, mergeKey) ||
        overrideTypes.has(typeof mergeValue) ||
        mergeValue === null
    ) {
        baseObject[mergeKey] = mergeValue
        return
    }

    if (Array.isArray(mergeValue) && Array.isArray(baseObject[mergeKey])) {
        baseObject[mergeKey] = (baseObject[mergeKey] as unknown[]).concat(mergeValue)
        return
    }

    if (typeof mergeValue === 'object' && typeof baseObject[mergeKey] === 'object') {
        if (baseObject[mergeKey] === null) {
            baseObject[mergeKey] = mergeValue
            return
        }

        for (const nextKey in mergeValue) {
            mergePropertyRecursively(
                baseObject[mergeKey] as Record<string, unknown>,
                nextKey,
                mergeValue[nextKey as keyof object],
            )
        }
    }
}
