import * as React from "react";
export interface IconTree {
    tag: string;
    attr: {
        [key: string]: string;
    };
    child: IconTree[];
}
export declare function GenIcon(data: IconTree): (props: IconBaseProps) => React.JSX.Element;
export interface IconBaseProps extends React.SVGAttributes<SVGElement> {
    children?: React.ReactNode;
    size?: string | number;
    color?: string;
    title?: string;
}
export type IconType = (props: IconBaseProps) => JSX.Element;
export declare function IconBase(props: IconBaseProps & {
    attr?: Record<string, string>;
}): JSX.Element;
