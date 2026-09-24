import { SSE } from 'sse.js';
import { request } from 'librechat-data-provider';
import type { ChatFrame, ChatTransport, ChatErrorData } from 'librechat-data-provider';
import { normalizeFrame } from './frames';

type StreamErrorEvent = MessageEvent & { responseCode?: number };

const jsonHeaders = (token?: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/**
 * POSTs the turn with `sse.js` and normalizes what comes back. Owns the wire:
 * frame parsing, named `attachment`/`error` events, and one token refresh and
 * retry on a 401. A frame that is not JSON is logged and skipped, so the
 * frames behind it in the same chunk still dispatch.
 */
export function createSSETransport({ token }: { token?: string }): ChatTransport {
  return {
    send({ server, payload }, { signal, onEvent }) {
      if (signal.aborted) {
        return;
      }

      const sse = new SSE(server, {
        payload: JSON.stringify(payload),
        headers: jsonHeaders(token),
      });

      sse.addEventListener('open', () => {
        onEvent({ type: 'open' });
      });

      sse.addEventListener('attachment', (e: MessageEvent) => {
        try {
          onEvent({ type: 'attachment', data: JSON.parse(e.data) });
        } catch (error) {
          console.error(error);
        }
      });

      sse.addEventListener('message', (e: MessageEvent) => {
        let frame: ChatFrame;
        try {
          frame = JSON.parse(e.data);
        } catch (error) {
          console.error('Skipping malformed stream frame:', error);
          return;
        }
        const event = normalizeFrame(frame);
        if (event) {
          onEvent(event);
        }
      });

      let refreshed = false;
      sse.addEventListener('error', async (e: StreamErrorEvent) => {
        if (e.responseCode === 401 && !refreshed) {
          refreshed = true;
          try {
            const refreshResponse = await request.refreshToken();
            if (signal.aborted) {
              return;
            }
            const refreshedToken = refreshResponse?.token ?? '';
            if (!refreshedToken) {
              throw new Error('Token refresh failed.');
            }
            sse.headers = jsonHeaders(refreshedToken);
            request.dispatchTokenUpdatedEvent(refreshedToken);
            sse.stream();
            return;
          } catch (error) {
            /* token refresh failed, continue handling the original 401 */
            console.log(error);
          }
          if (signal.aborted) {
            return;
          }
        }

        let data: ChatErrorData | null | undefined;
        try {
          data = JSON.parse(e.data);
        } catch (error) {
          console.error(error);
          console.log(e);
        }
        onEvent({ type: 'error', data });
      });

      sse.addEventListener('cancel', () => {
        onEvent({ type: 'abort' });
      });

      signal.addEventListener(
        'abort',
        () => {
          const wasOpen = sse.readyState <= 1;
          sse.close();
          if (wasOpen) {
            // @ts-expect-error sse.js declares dispatchEvent as (type, listener); it takes an event
            sse.dispatchEvent(new Event('cancel'));
          }
        },
        { once: true },
      );

      sse.stream();
    },
  };
}
