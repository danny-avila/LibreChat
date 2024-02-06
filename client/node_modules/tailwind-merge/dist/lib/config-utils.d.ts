import { Config } from './types';
export type ConfigUtils = ReturnType<typeof createConfigUtils>;
export declare function createConfigUtils(config: Config): {
    getClassGroupId: (className: string) => string | undefined;
    getConflictingClassGroupIds: (classGroupId: string, hasPostfixModifier: boolean) => readonly string[];
    cache: import("./lru-cache").LruCache<string, string>;
    splitModifiers: (className: string) => {
        modifiers: string[];
        hasImportantModifier: boolean;
        baseClassName: string;
        maybePostfixModifierPosition: number | undefined;
    };
};
