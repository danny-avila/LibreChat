import * as React from 'react';
export declare const Entry: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
export declare const Label: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
export declare const LabelButton: React.ForwardRefExoticComponent<Pick<React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, "key" | keyof React.ButtonHTMLAttributes<HTMLButtonElement>> & React.RefAttributes<HTMLButtonElement>>;
export declare const ExpandButton: React.ForwardRefExoticComponent<Pick<React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, "key" | keyof React.ButtonHTMLAttributes<HTMLButtonElement>> & React.RefAttributes<HTMLButtonElement>>;
export declare const CopyButton: ({ value }: {
    value: unknown;
}) => JSX.Element;
export declare const Value: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
export declare const SubEntries: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
export declare const Info: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
declare type ExpanderProps = {
    expanded: boolean;
    style?: React.CSSProperties;
};
export declare const Expander: ({ expanded, style }: ExpanderProps) => JSX.Element;
declare type Entry = {
    label: string;
};
declare type RendererProps = {
    handleEntry: (entry: Entry) => JSX.Element;
    label?: string;
    value: unknown;
    subEntries: Entry[];
    subEntryPages: Entry[][];
    type: string;
    expanded: boolean;
    copyable: boolean;
    toggleExpanded: () => void;
    pageSize: number;
};
/**
 * Chunk elements in the array by size
 *
 * when the array cannot be chunked evenly by size, the last chunk will be
 * filled with the remaining elements
 *
 * @example
 * chunkArray(['a','b', 'c', 'd', 'e'], 2) // returns [['a','b'], ['c', 'd'], ['e']]
 */
export declare function chunkArray<T>(array: T[], size: number): T[][];
declare type Renderer = (props: RendererProps) => JSX.Element;
export declare const DefaultRenderer: Renderer;
declare type ExplorerProps = Partial<RendererProps> & {
    renderer?: Renderer;
    defaultExpanded?: true | Record<string, boolean>;
    copyable?: boolean;
};
export default function Explorer({ value, defaultExpanded, renderer, pageSize, copyable, ...rest }: ExplorerProps): JSX.Element;
export {};
//# sourceMappingURL=Explorer.d.ts.map