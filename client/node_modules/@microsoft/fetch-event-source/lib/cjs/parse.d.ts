export interface EventSourceMessage {
    id: string;
    event: string;
    data: string;
    retry?: number;
}
export declare function getBytes(stream: ReadableStream<Uint8Array>, onChunk: (arr: Uint8Array) => void): Promise<void>;
export declare function getLines(onLine: (line: Uint8Array, fieldLength: number) => void): (arr: Uint8Array) => void;
export declare function getMessages(onId: (id: string) => void, onRetry: (retry: number) => void, onMessage?: (msg: EventSourceMessage) => void): (line: Uint8Array, fieldLength: number) => void;
