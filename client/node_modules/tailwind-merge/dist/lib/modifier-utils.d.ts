import { Config } from './types';
export declare const IMPORTANT_MODIFIER = "!";
export declare function createSplitModifiers(config: Config): (className: string) => {
    modifiers: string[];
    hasImportantModifier: boolean;
    baseClassName: string;
    maybePostfixModifierPosition: number | undefined;
};
/**
 * Sorts modifiers according to following schema:
 * - Predefined modifiers are sorted alphabetically
 * - When an arbitrary variant appears, it must be preserved which modifiers are before and after it
 */
export declare function sortModifiers(modifiers: string[]): string[];
