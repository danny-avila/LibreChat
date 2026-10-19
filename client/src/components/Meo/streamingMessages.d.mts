export declare function visibleTranscript(total: number, count?: number): number;
export declare function appendAssistantChunk<T extends {role: string; content: string}>(messages: T[], chunk: string): T[];
