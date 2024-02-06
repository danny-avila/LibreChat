import type { Declaration, Result } from 'postcss';
export declare function onCSSDeclaration(decl: Declaration, result: Result, options: {
    preserve: boolean;
}): void;
export declare const placeMatch: RegExp;
