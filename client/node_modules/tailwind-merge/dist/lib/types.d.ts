export interface Config {
    /**
     * Integer indicating size of LRU cache used for memoizing results.
     * - Cache might be up to twice as big as `cacheSize`
     * - No cache is used for values <= 0
     */
    cacheSize: number;
    /**
     * Prefix added to Tailwind-generated classes
     * @see https://tailwindcss.com/docs/configuration#prefix
     */
    prefix?: string;
    /**
     * Custom separator for modifiers in Tailwind classes
     * @see https://tailwindcss.com/docs/configuration#separator
     */
    separator?: string;
    /**
     * Theme scales used in classGroups.
     * The keys are the same as in the Tailwind config but the values are sometimes defined more broadly.
     */
    theme: ThemeObject;
    /**
     * Object with groups of classes.
     * @example
     * {
     *     // Creates group of classes `group`, `of` and `classes`
     *     'group-id': ['group', 'of', 'classes'],
     *     // Creates group of classes `look-at-me-other` and `look-at-me-group`.
     *     'other-group': [{ 'look-at-me': ['other', 'group']}]
     * }
     */
    classGroups: Record<ClassGroupId, ClassGroup>;
    /**
     * Conflicting classes across groups.
     * The key is ID of class group which creates conflict, values are IDs of class groups which receive a conflict.
     * A class group ID is the key of a class group in classGroups object.
     * @example { gap: ['gap-x', 'gap-y'] }
     */
    conflictingClassGroups: Record<ClassGroupId, readonly ClassGroupId[]>;
    /**
     * Postfix modifiers conflicting with other class groups.
     * A class group ID is the key of a class group in classGroups object.
     * @example { 'font-size': ['leading'] }
     */
    conflictingClassGroupModifiers?: Record<ClassGroupId, readonly ClassGroupId[]>;
}
export type ThemeObject = Record<string, ClassGroup>;
export type ClassGroupId = string;
export type ClassGroup = readonly ClassDefinition[];
type ClassDefinition = string | ClassValidator | ThemeGetter | ClassObject;
export type ClassValidator = (classPart: string) => boolean;
export interface ThemeGetter {
    (theme: ThemeObject): ClassGroup;
    isThemeGetter: true;
}
type ClassObject = Record<string, readonly ClassDefinition[]>;
export {};
