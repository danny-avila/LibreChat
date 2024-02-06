import * as React from "react";
export interface IconContext {
    color?: string;
    size?: string;
    className?: string;
    style?: React.CSSProperties;
    attr?: React.SVGAttributes<SVGElement>;
}
export declare const DefaultContext: IconContext;
export declare const IconContext: React.Context<IconContext>;
