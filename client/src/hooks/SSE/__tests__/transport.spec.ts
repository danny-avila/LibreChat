import { SSE } from 'sse.js';

/**
 * `useResumableSSE` decides that a hidden tab lost its stream by reading the
 * transport's own `readyState`. That only holds because sse.js marks the
 * connection closed on the ordinary XHR `load` path — a response body that
 * simply ends dispatches no error and no abort, so `readyState` is the single
 * observable left. The assumption belongs to the library rather than to our
 * hook, so it is pinned here against the real module instead of a mock.
 */
type XHRListener = (event: { currentTarget: FakeXHR }) => void;

class FakeXHR {
  static readonly HEADERS_RECEIVED = 2;
  readyState = 0;
  status = 200;
  responseText = '';
  withCredentials = false;
  aborted = false;
  private readonly listeners: Record<string, XHRListener[]> = {};

  addEventListener(type: string, listener: XHRListener) {
    (this.listeners[type] ??= []).push(listener);
  }

  open() {}
  setRequestHeader() {}
  send() {}
  getAllResponseHeaders() {
    return 'Content-Type: text/plain';
  }

  abort() {
    this.aborted = true;
    this.emit('abort');
  }

  emit(type: string) {
    for (const listener of this.listeners[type] ?? []) {
      listener({ currentTarget: this });
    }
  }
}

describe('sse.js transport contract', () => {
  const OriginalXHR = global.XMLHttpRequest;
  let xhr: FakeXHR;

  beforeEach(() => {
    xhr = new FakeXHR();
    global.XMLHttpRequest = Object.assign(
      jest.fn(() => xhr),
      {
        HEADERS_RECEIVED: FakeXHR.HEADERS_RECEIVED,
      },
    ) as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    global.XMLHttpRequest = OriginalXHR;
  });

  it('marks the connection closed when the response body ends without a terminal event', () => {
    const sse = new SSE('/api/agents/chat/stream/convo-1', { method: 'GET' });
    const onError = jest.fn();
    const onAbort = jest.fn();
    sse.addEventListener('error', onError);
    sse.addEventListener('abort', onAbort);

    xhr.responseText = 'event: message\ndata: {"created":true}\n\n';
    xhr.emit('progress');
    expect(sse.readyState).not.toBe(SSE.CLOSED);

    /** The intermediary ended the body under a frozen tab: XHR reports an
     *  ordinary load, and sse.js dispatches nothing for it. */
    xhr.emit('load');

    expect(onError).not.toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();
    expect(sse.readyState).toBe(SSE.CLOSED);
  });

  it('dispatches abort when the user agent cancels an in-flight request', () => {
    const sse = new SSE('/api/agents/chat/stream/convo-1', { method: 'GET' });
    const onAbort = jest.fn();
    sse.addEventListener('abort', onAbort);

    xhr.emit('abort');

    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(sse.readyState).toBe(SSE.CLOSED);
  });

  it('emits open before error even for unsuccessful HTTP responses', () => {
    const sse = new SSE('/api/agents/chat/stream/convo-1', { method: 'GET' });
    const events: string[] = [];
    sse.addEventListener('open', (event: Event & { responseCode?: number }) => {
      events.push(`open:${event.responseCode}`);
    });
    sse.addEventListener('error', (event: Event & { responseCode?: number }) => {
      events.push(`error:${event.responseCode}`);
    });
    xhr.status = 503;
    xhr.readyState = FakeXHR.HEADERS_RECEIVED;
    xhr.emit('readystatechange');
    xhr.emit('progress');
    expect(events).toEqual(['open:503', 'error:503']);
  });
});
