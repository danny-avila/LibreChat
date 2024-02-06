import type { Declaration } from 'postcss';
export declare enum Direction {
    Block = "block",
    Inline = "inline"
}
export declare enum DirectionValue {
    Start = "start",
    End = "end"
}
export declare const DirectionValues: {
    BlockStart: string;
    BlockEnd: string;
    InlineStart: string;
    InlineEnd: string;
};
export declare enum DirectionFlow {
    TopToBottom = "top-to-bottom",
    BottomToTop = "bottom-to-top",
    RightToLeft = "right-to-left",
    LeftToRight = "left-to-right"
}
export declare enum Axes {
    Top = "top",
    Right = "right",
    Bottom = "bottom",
    Left = "left"
}
export type DirectionConfig = {
    [Direction.Block]: [Axes, Axes];
    [Direction.Inline]: [Axes, Axes];
    inlineIsHorizontal: boolean;
};
export type TransformFunction = (decl: Declaration) => Array<Declaration>;
