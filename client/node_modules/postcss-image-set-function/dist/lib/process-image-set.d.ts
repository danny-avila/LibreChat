import type { Declaration, Result, Postcss } from 'postcss';
import type { Node } from 'postcss-value-parser';
type imageSetFunction = {
    imageSetFunction: Node;
    imageSetOptionNodes: Array<Node>;
};
export declare const processImageSet: (imageSetFunctions: Array<imageSetFunction>, decl: Declaration, opts: {
    decl: Declaration;
    oninvalid: 'warn' | 'throw' | 'ignore' | false;
    preserve: boolean;
    result: Result;
    postcss: Postcss;
}) => void;
export {};
