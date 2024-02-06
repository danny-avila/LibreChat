import * as React from 'react';
import type { Theme } from './theme';
import type { Query } from '@tanstack/react-query';
declare type StyledComponent<T> = T extends 'button' ? React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> : T extends 'input' ? React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> : T extends 'select' ? React.DetailedHTMLProps<React.SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement> : T extends keyof HTMLElementTagNameMap ? React.HTMLAttributes<HTMLElementTagNameMap[T]> : never;
export declare function getQueryStatusColor({ queryState, observerCount, isStale, theme, }: {
    queryState: Query['state'];
    observerCount: number;
    isStale: boolean;
    theme: Theme;
}): "#3f4e60" | "#00ab52" | "#006bff" | "#8c49eb" | "#ffb200";
export declare function getQueryStatusLabel(query: Query): "fetching" | "paused" | "inactive" | "stale" | "fresh";
declare type Styles = React.CSSProperties | ((props: Record<string, any>, theme: Theme) => React.CSSProperties);
export declare function styled<T extends keyof HTMLElementTagNameMap>(type: T, newStyles: Styles, queries?: Record<string, Styles>): React.ForwardRefExoticComponent<React.PropsWithoutRef<StyledComponent<T>> & React.RefAttributes<HTMLElementTagNameMap[T]>>;
export declare function useIsMounted(): () => boolean;
/**
 * Displays a string regardless the type of the data
 * @param {unknown} value Value to be stringified
 * @param {boolean} beautify Formats json to multiline
 */
export declare const displayValue: (value: unknown, beautify?: boolean) => string;
declare type SortFn = (a: Query, b: Query) => number;
export declare const sortFns: Record<string, SortFn>;
export declare const minPanelSize = 70;
export declare const defaultPanelSize = 500;
export declare const sides: Record<Side, Side>;
export declare type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export declare type Side = 'left' | 'right' | 'top' | 'bottom';
/**
 * Check if the given side is vertical (left/right)
 */
export declare function isVerticalSide(side: Side): boolean;
/**
 * Get the opposite side, eg 'left' => 'right'. 'top' => 'bottom', etc
 */
export declare function getOppositeSide(side: Side): Side;
/**
 * Given as css prop it will return a sided css prop based on a given side
 * Example given `border` and `right` it return `borderRight`
 */
export declare function getSidedProp<T extends string>(prop: T, side: Side): `${T}Left` | `${T}Right` | `${T}Bottom` | `${T}Top`;
export interface SidePanelStyleOptions {
    /**
     * Position of the panel
     * Defaults to 'bottom'
     */
    position?: Side;
    /**
     * Staring height for the panel, it is set if the position is horizontal eg 'top' or 'bottom'
     * Defaults to 500
     */
    height?: number;
    /**
     * Staring width for the panel, it is set if the position is vertical eg 'left' or 'right'
     * Defaults to 500
     */
    width?: number;
    /**
     * RQ devtools theme
     */
    devtoolsTheme: Theme;
    /**
     * Sets the correct transition and visibility styles
     */
    isOpen?: boolean;
    /**
     * If the panel is resizing set to true to apply the correct transition styles
     */
    isResizing?: boolean;
    /**
     * Extra panel style passed by the user
     */
    panelStyle?: React.CSSProperties;
}
export declare function getSidePanelStyle({ position, height, width, devtoolsTheme, isOpen, isResizing, panelStyle, }: SidePanelStyleOptions): React.CSSProperties;
/**
 * Get resize handle style based on a given side
 */
export declare function getResizeHandleStyle(position?: Side): React.CSSProperties;
export {};
//# sourceMappingURL=utils.d.ts.map