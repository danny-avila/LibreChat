import { type InnerProps } from '@floating-ui/react';
import * as React from 'react';
type Align = 'start' | 'end';
type Placement = 'top' | 'right' | 'bottom' | 'left';
type BaseAnchorProps = {
    /**
     * The `gap` is the space between the trigger and the panel.
     */
    gap: number | string;
    /**
     * The `offset` is the amount the panel should be nudged from its original position.
     */
    offset: number | string;
    /**
     * The `padding` is the minimum space between the panel and the viewport.
     */
    padding: number | string;
};
export type AnchorProps = Partial<BaseAnchorProps & {
    /**
     * The `to` value defines which side of the trigger the panel should be placed on and its
     * alignment.
     */
    to: `${Placement}` | `${Placement} ${Align}`;
}>;
export type AnchorPropsWithSelection = Partial<BaseAnchorProps & {
    /**
     * The `to` value defines which side of the trigger the panel should be placed on and its
     * alignment.
     */
    to: `${Placement | 'selection'}` | `${Placement | 'selection'} ${Align}`;
}>;
export type InternalFloatingPanelProps = Partial<{
    inner: {
        listRef: InnerProps['listRef'];
        index: InnerProps['index'];
    };
}>;
export declare function useFloatingReference(): ((node: import("@floating-ui/react-dom").ReferenceType | null) => void) & ((node: any) => void);
export declare function useFloatingReferenceProps(): (userProps?: React.HTMLProps<Element> | undefined) => Record<string, unknown>;
export declare function useFloatingPanelProps(): (userProps?: React.HTMLProps<HTMLElement> | undefined) => Record<string, unknown> & {
    'data-anchor': Placement | "left end" | "left start" | "right end" | "right start" | "top end" | "top start" | "bottom end" | "bottom start" | "selection" | "selection end" | "selection start" | undefined;
};
export declare function useFloatingPanel(placement?: AnchorPropsWithSelection & InternalFloatingPanelProps): readonly [((node: HTMLElement | null) => void) & ((node: HTMLElement | null) => void), React.CSSProperties | undefined];
export declare function FloatingProvider({ children, enabled, }: {
    children: React.ReactNode;
    enabled?: boolean;
}): React.JSX.Element;
export {};
