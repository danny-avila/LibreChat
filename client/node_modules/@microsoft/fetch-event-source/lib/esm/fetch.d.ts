import { EventSourceMessage } from './parse';
export declare const EventStreamContentType = "text/event-stream";
export interface FetchEventSourceInit extends RequestInit {
    headers?: Record<string, string>;
    onopen?: (response: Response) => Promise<void>;
    onmessage?: (ev: EventSourceMessage) => void;
    onclose?: () => void;
    onerror?: (err: any) => number | null | undefined | void;
    openWhenHidden?: boolean;
    fetch?: typeof fetch;
}
export declare function fetchEventSource(input: RequestInfo, { signal: inputSignal, headers: inputHeaders, onopen: inputOnOpen, onmessage, onclose, onerror, openWhenHidden, fetch: inputFetch, ...rest }: FetchEventSourceInit): Promise<void>;
