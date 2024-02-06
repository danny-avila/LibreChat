import * as React from 'react';
export declare const defaultTheme: {
    readonly background: "#0b1521";
    readonly backgroundAlt: "#132337";
    readonly foreground: "white";
    readonly gray: "#3f4e60";
    readonly grayAlt: "#222e3e";
    readonly inputBackgroundColor: "#fff";
    readonly inputTextColor: "#000";
    readonly success: "#00ab52";
    readonly danger: "#ff0085";
    readonly active: "#006bff";
    readonly paused: "#8c49eb";
    readonly warning: "#ffb200";
};
export declare type Theme = typeof defaultTheme;
interface ProviderProps {
    theme: Theme;
    children?: React.ReactNode;
}
export declare function ThemeProvider({ theme, ...rest }: ProviderProps): JSX.Element;
export declare function useTheme(): {
    readonly background: "#0b1521";
    readonly backgroundAlt: "#132337";
    readonly foreground: "white";
    readonly gray: "#3f4e60";
    readonly grayAlt: "#222e3e";
    readonly inputBackgroundColor: "#fff";
    readonly inputTextColor: "#000";
    readonly success: "#00ab52";
    readonly danger: "#ff0085";
    readonly active: "#006bff";
    readonly paused: "#8c49eb";
    readonly warning: "#ffb200";
};
export {};
//# sourceMappingURL=theme.d.ts.map