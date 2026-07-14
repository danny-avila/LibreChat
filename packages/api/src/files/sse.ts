import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { logger } from '@librechat/data-schemas';

const HEARTBEAT_INTERVAL_MS = 1000;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Access-Control-Allow-Origin': '*',
  Connection: 'keep-alive',
  /** Required so Nginx/other proxies don't buffer the stream. */
  'X-Accel-Buffering': 'no',
};

function writeSseEvent<T>(res: Response, event: string, data: T): void {
  res.write(`event:${event}\nid:${Date.now()}\ndata:${JSON.stringify(data)}\n\n`);
}

export interface UploadSseStream {
  /** Emits the successful upload payload as an `event:data` message. */
  sendData: <T>(data: T) => void;
  /** Emits a failure payload as an `event:error` message. */
  sendError: <T>(data: T) => void;
  /** Emits the terminal `event:close` message, stops the heartbeat, and ends the response. */
  close: () => void;
}

/**
 * Opens a keep-alive SSE stream for a file-upload response: sends the SSE headers, starts a
 * heartbeat interval so proxies/clients don't time out the connection during long-running
 * uploads, and stops the heartbeat when the client disconnects early.
 *
 * Callers must only invoke this once all synchronous validation and permission checks that
 * might still need to send a normal (non-SSE) response have already passed — once the headers
 * are flushed here, the HTTP status is committed to 200 and can no longer be changed.
 */
export function startUploadSseStream(req: ServerRequest, res: Response): UploadSseStream {
  res.writeHead(200, SSE_HEADERS);
  res.flushHeaders();

  let counter = 1;
  const intervalId = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(intervalId);
      return;
    }
    writeSseEvent(res, 'heartbeat', { keepAlive: counter++ });
  }, HEARTBEAT_INTERVAL_MS);

  req.on('close', () => {
    clearInterval(intervalId);
    logger.debug('[uploadSseStream] Client disconnected');
  });

  return {
    sendData: (data) => writeSseEvent(res, 'data', data),
    sendError: (data) => writeSseEvent(res, 'error', data),
    close: () => {
      if (!res.writableEnded) {
        writeSseEvent(res, 'close', { closedAt: new Date().toISOString() });
        res.end();
      }
      clearInterval(intervalId);
    },
  };
}

/**
 * Sends a successful upload response, either as an SSE `event:data` message (when an upload
 * stream is active) or as a plain JSON response.
 */
export function sendUploadSuccess<T extends object>(
  res: Response,
  sseStream: UploadSseStream | null | undefined,
  message: string,
  result: T,
): void {
  if (sseStream) {
    sseStream.sendData({ message, ...result });
    return;
  }
  res.status(200).json({ message, ...result });
}
