import type * as CLSX from "clsx";
export type ClassPropKey = "class" | "className";
export type ClassValue = CLSX.ClassValue;
export type ClassProp = {
    class: ClassValue;
    className?: never;
} | {
    class?: never;
    className: ClassValue;
} | {
    class?: never;
    className?: never;
};
export type OmitUndefined<T> = T extends undefined ? never : T;
export type StringToBoolean<T> = T extends "true" | "false" ? boolean : T;
