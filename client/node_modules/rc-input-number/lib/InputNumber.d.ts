import * as React from 'react';
import { ValueType } from '@rc-component/mini-decimal';
export interface InputNumberProps<T extends ValueType = ValueType> extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onInput' | 'onChange'> {
    /** value will show as string */
    stringMode?: boolean;
    defaultValue?: T;
    value?: T | null;
    prefixCls?: string;
    className?: string;
    style?: React.CSSProperties;
    min?: T;
    max?: T;
    step?: ValueType;
    tabIndex?: number;
    controls?: boolean;
    upHandler?: React.ReactNode;
    downHandler?: React.ReactNode;
    keyboard?: boolean;
    /** Parse display value to validate number */
    parser?: (displayValue: string | undefined) => T;
    /** Transform `value` to display value show in input */
    formatter?: (value: T | undefined, info: {
        userTyping: boolean;
        input: string;
    }) => string;
    /** Syntactic sugar of `formatter`. Config precision of display. */
    precision?: number;
    /** Syntactic sugar of `formatter`. Config decimal separator of display. */
    decimalSeparator?: string;
    onInput?: (text: string) => void;
    onChange?: (value: T | null) => void;
    onPressEnter?: React.KeyboardEventHandler<HTMLInputElement>;
    onStep?: (value: T, info: {
        offset: ValueType;
        type: 'up' | 'down';
    }) => void;
}
declare const InputNumber: (<T extends ValueType = ValueType>(props: InputNumberProps<T> & {
    children?: React.ReactNode;
} & {
    ref?: React.Ref<HTMLInputElement>;
}) => React.ReactElement) & {
    displayName?: string;
};
export default InputNumber;
