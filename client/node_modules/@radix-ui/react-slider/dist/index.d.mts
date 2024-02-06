import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
type Direction = 'ltr' | 'rtl';
export const createSliderScope: import("@radix-ui/react-context").CreateScope;
export interface SliderProps extends Omit<SliderHorizontalProps | SliderVerticalProps, keyof SliderOrientationPrivateProps | 'defaultValue'> {
    name?: string;
    disabled?: boolean;
    orientation?: React.AriaAttributes['aria-orientation'];
    dir?: Direction;
    min?: number;
    max?: number;
    step?: number;
    minStepsBetweenThumbs?: number;
    value?: number[];
    defaultValue?: number[];
    onValueChange?(value: number[]): void;
    onValueCommit?(value: number[]): void;
    inverted?: boolean;
}
export const Slider: React.ForwardRefExoticComponent<SliderProps & React.RefAttributes<HTMLSpanElement>>;
type SliderOrientationPrivateProps = {
    min: number;
    max: number;
    inverted: boolean;
    onSlideStart?(value: number): void;
    onSlideMove?(value: number): void;
    onSlideEnd?(): void;
    onHomeKeyDown(event: React.KeyboardEvent): void;
    onEndKeyDown(event: React.KeyboardEvent): void;
    onStepKeyDown(step: {
        event: React.KeyboardEvent;
        direction: number;
    }): void;
};
interface SliderOrientationProps extends Omit<SliderImplProps, keyof SliderImplPrivateProps>, SliderOrientationPrivateProps {
}
interface SliderHorizontalProps extends SliderOrientationProps {
    dir?: Direction;
}
interface SliderVerticalProps extends SliderOrientationProps {
}
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
type SliderImplPrivateProps = {
    onSlideStart(event: React.PointerEvent): void;
    onSlideMove(event: React.PointerEvent): void;
    onSlideEnd(event: React.PointerEvent): void;
    onHomeKeyDown(event: React.KeyboardEvent): void;
    onEndKeyDown(event: React.KeyboardEvent): void;
    onStepKeyDown(event: React.KeyboardEvent): void;
};
interface SliderImplProps extends PrimitiveDivProps, SliderImplPrivateProps {
}
type PrimitiveSpanProps = Radix.ComponentPropsWithoutRef<typeof Primitive.span>;
export interface SliderTrackProps extends PrimitiveSpanProps {
}
export const SliderTrack: React.ForwardRefExoticComponent<SliderTrackProps & React.RefAttributes<HTMLSpanElement>>;
export interface SliderRangeProps extends PrimitiveSpanProps {
}
export const SliderRange: React.ForwardRefExoticComponent<SliderRangeProps & React.RefAttributes<HTMLSpanElement>>;
export interface SliderThumbProps extends Omit<SliderThumbImplProps, 'index'> {
}
export const SliderThumb: React.ForwardRefExoticComponent<SliderThumbProps & React.RefAttributes<HTMLSpanElement>>;
interface SliderThumbImplProps extends PrimitiveSpanProps {
    index: number;
}
export const Root: React.ForwardRefExoticComponent<SliderProps & React.RefAttributes<HTMLSpanElement>>;
export const Track: React.ForwardRefExoticComponent<SliderTrackProps & React.RefAttributes<HTMLSpanElement>>;
export const Range: React.ForwardRefExoticComponent<SliderRangeProps & React.RefAttributes<HTMLSpanElement>>;
export const Thumb: React.ForwardRefExoticComponent<SliderThumbProps & React.RefAttributes<HTMLSpanElement>>;

//# sourceMappingURL=index.d.ts.map
