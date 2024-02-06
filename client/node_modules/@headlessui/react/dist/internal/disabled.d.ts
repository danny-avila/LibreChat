import React from 'react';
export declare function useDisabled(): boolean | undefined;
export declare function DisabledProvider({ value, children, }: React.PropsWithChildren<{
    value?: boolean;
}>): React.JSX.Element;
