import React from 'react';
export declare function useProvidedId(): string | undefined;
export declare function IdProvider({ id, children }: React.PropsWithChildren<{
    id: string | undefined;
}>): React.JSX.Element;
