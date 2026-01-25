import type { Response as ServerResponse } from 'express';
import type { ServerSentEvent } from '~/types';

/**
 * Safely writes to a server response, handling disconnected clients.
 * @param res - The server response.
 * @param data - The data to write.
 * @returns true if write succeeded, false otherwise.
 */
function safeWrite(res: ServerResponse, data: string): boolean {
  try {
    if (!res.writable) {
      return false;
    }
    res.write(data);
    return true;
  } catch {
    // Client may have disconnected - log but don't crash
    return false;
  }
}

/**
 * Sends message data in Server Sent Events format.
 * @param res - The server response.
 * @param event - The message event.
 * @param event.event - The type of event.
 * @param event.data - The message to be sent.
 */
export function sendEvent(res: ServerResponse, event: ServerSentEvent): void {
  if (typeof event.data === 'string' && event.data.length === 0) {
    return;
  }
  safeWrite(res, `event: message\ndata: ${JSON.stringify(event)}\n\n`);
}

/**
 * Sends error data in Server Sent Events format and ends the response.
 * @param res - The server response.
 * @param message - The error message.
 */
export function handleError(res: ServerResponse, message: string): void {
  safeWrite(res, `event: error\ndata: ${JSON.stringify(message)}\n\n`);
  try {
    res.end();
  } catch {
    // Client may have disconnected
  }
}

/**
 * Sends progress notification in Server Sent Events format.
 * @param res - The server response.
 * @param progressData - Progress notification data.
 */
export function sendProgress(
  res: ServerResponse,
  progressData: {
    progressToken: string | number;
    progress: number;
    total?: number;
    message?: string;
    serverName?: string;
    toolCallId?: string; // Tool call ID for matching progress to specific tool call
  }
): void {
  safeWrite(res, `event: progress\ndata: ${JSON.stringify(progressData)}\n\n`);
}
