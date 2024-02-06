export declare function isArray(data: unknown): data is unknown[];
export declare function assert(condition: unknown, msg?: string): asserts condition;
export declare function getValues<T>(data: Record<string, T>): T[];
export declare function getKeys<T>(data: Record<string, T>): string[];
export declare function getEntries<T>(data: Record<string, T>): [string, T][];
export declare function normalizeFileName(fileName: string, extension: string, fileNameFormatter: (name: string) => string): string;
export declare function normalizeXMLName(name: string): string;
export declare function indent(spaces: number): string;
export declare function stripHTML(text: string): string;
