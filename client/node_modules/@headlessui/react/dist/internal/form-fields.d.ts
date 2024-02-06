import React from 'react';
export declare function FormFieldsProvider(props: React.PropsWithChildren<{}>): React.JSX.Element;
export declare function HoistFormFields({ children }: React.PropsWithChildren<{}>): React.JSX.Element | null;
export declare function FormFields({ data, form: formId, onReset, }: {
    data: Record<string, any>;
    form?: string;
    onReset?: (e: Event) => void;
}): React.JSX.Element;
