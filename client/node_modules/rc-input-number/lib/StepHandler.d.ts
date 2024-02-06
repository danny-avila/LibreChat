import * as React from 'react';
export interface StepHandlerProps {
    prefixCls: string;
    upNode?: React.ReactNode;
    downNode?: React.ReactNode;
    upDisabled?: boolean;
    downDisabled?: boolean;
    onStep: (up: boolean) => void;
}
export default function StepHandler({ prefixCls, upNode, downNode, upDisabled, downDisabled, onStep, }: StepHandlerProps): JSX.Element;
