import * as React from 'react';
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
type Style = Omit<NonNullable<TextareaProps['style']>, 'maxHeight' | 'minHeight'> & {
    height?: number;
};
export type TextareaHeightChangeMeta = {
    rowHeight: number;
};
export interface TextareaAutosizeProps extends Omit<TextareaProps, 'style'> {
    maxRows?: number;
    minRows?: number;
    onHeightChange?: (height: number, meta: TextareaHeightChangeMeta) => void;
    cacheMeasurements?: boolean;
    style?: Style;
}
declare const _default: React.ForwardRefExoticComponent<TextareaAutosizeProps & React.RefAttributes<HTMLTextAreaElement>>;
export default _default;
