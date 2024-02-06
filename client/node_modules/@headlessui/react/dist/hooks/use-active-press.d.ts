export declare function useActivePress({ disabled }?: Partial<{
    disabled: boolean;
}>): {
    pressed: boolean;
    pressProps: {
        onPointerDown?: undefined;
        onPointerUp?: undefined;
        onClick?: undefined;
    } | {
        onPointerDown: (event: PointerEvent) => void;
        onPointerUp: () => void;
        onClick: () => void;
    };
};
