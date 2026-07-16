import { EventEmitter } from 'events';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { sendUploadSuccess, startUploadSseStream } from './sse';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
  },
}));

describe('sse', () => {
  const createMockReq = (): ServerRequest => new EventEmitter() as unknown as ServerRequest;

  const createMockRes = (): jest.Mocked<Response> => {
    const res = new EventEmitter() as unknown as jest.Mocked<Response>;
    res.writeHead = jest.fn().mockReturnValue(res);
    res.flushHeaders = jest.fn().mockReturnValue(res);
    res.write = jest.fn().mockReturnValue(true);
    res.end = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    Object.defineProperty(res, 'writableEnded', { value: false, writable: true });
    return res;
  };

  const parseEvents = (res: jest.Mocked<Response>): Array<{ event: string; data: unknown }> =>
    (res.write as jest.Mock).mock.calls.map(([chunk]: [string]) => {
      const eventMatch = /event:(.*)\n/.exec(chunk);
      const dataMatch = /data:(.*)\n\n/.exec(chunk);
      return {
        event: eventMatch ? eventMatch[1] : '',
        data: dataMatch ? JSON.parse(dataMatch[1]) : undefined,
      };
    });

  describe('startUploadSseStream', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('writes the SSE headers and flushes them immediately', () => {
      const req = createMockReq();
      const res = createMockRes();

      startUploadSseStream(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
        }),
      );
      expect(res.flushHeaders).toHaveBeenCalledTimes(1);
    });

    it('emits a heartbeat event on every interval tick', () => {
      const req = createMockReq();
      const res = createMockRes();

      startUploadSseStream(req, res);

      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);

      const heartbeats = parseEvents(res).filter((e) => e.event === 'heartbeat');
      expect(heartbeats).toHaveLength(3);
      expect(heartbeats.map((e) => e.data)).toEqual([
        { keepAlive: 1 },
        { keepAlive: 2 },
        { keepAlive: 3 },
      ]);
    });

    it('stops the heartbeat once the response has already ended', () => {
      const req = createMockReq();
      const res = createMockRes();

      startUploadSseStream(req, res);

      jest.advanceTimersByTime(1000);
      Object.defineProperty(res, 'writableEnded', { value: true });
      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);

      const heartbeats = parseEvents(res).filter((e) => e.event === 'heartbeat');
      expect(heartbeats).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('clears the heartbeat interval when the client disconnects early', () => {
      const req = createMockReq();
      const res = createMockRes();

      startUploadSseStream(req, res);
      expect(jest.getTimerCount()).toBe(1);

      req.emit('close');

      expect(jest.getTimerCount()).toBe(0);
    });

    it('sendData emits an event:data message with the payload', () => {
      const req = createMockReq();
      const res = createMockRes();

      const stream = startUploadSseStream(req, res);
      stream.sendData({ file_id: 'abc' });

      const [dataEvent] = parseEvents(res).filter((e) => e.event === 'data');
      expect(dataEvent.data).toEqual({ file_id: 'abc' });
    });

    it('sendError emits an event:error message with the payload', () => {
      const req = createMockReq();
      const res = createMockRes();

      const stream = startUploadSseStream(req, res);
      stream.sendError({ message: 'failed' });

      const [errorEvent] = parseEvents(res).filter((e) => e.event === 'error');
      expect(errorEvent.data).toEqual({ message: 'failed' });
    });

    describe('close', () => {
      it('emits a close event, ends the response, and clears the heartbeat', () => {
        const req = createMockReq();
        const res = createMockRes();

        const stream = startUploadSseStream(req, res);
        stream.close();

        const closeEvents = parseEvents(res).filter((e) => e.event === 'close');
        expect(closeEvents).toHaveLength(1);
        expect(closeEvents[0].data).toEqual(
          expect.objectContaining({ closedAt: expect.any(String) }),
        );
        expect(res.end).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
      });

      it('is a no-op for the close-event write when the response already ended', () => {
        const req = createMockReq();
        const res = createMockRes();

        const stream = startUploadSseStream(req, res);
        Object.defineProperty(res, 'writableEnded', { value: true });
        stream.close();

        const closeEvents = parseEvents(res).filter((e) => e.event === 'close');
        expect(closeEvents).toHaveLength(0);
        expect(res.end).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
      });

      it('does not emit further heartbeats after close', () => {
        const req = createMockReq();
        const res = createMockRes();

        const stream = startUploadSseStream(req, res);
        stream.close();

        jest.advanceTimersByTime(5000);

        const heartbeats = parseEvents(res).filter((e) => e.event === 'heartbeat');
        expect(heartbeats).toHaveLength(0);
      });
    });
  });

  describe('sendUploadSuccess', () => {
    it('sends the payload over the SSE stream when a stream is active', () => {
      const res = createMockRes();
      const sseStream = {
        sendData: jest.fn(),
        sendError: jest.fn(),
        close: jest.fn(),
      };

      sendUploadSuccess(res, sseStream, 'Upload complete', { file_id: 'abc' });

      expect(sseStream.sendData).toHaveBeenCalledWith({
        message: 'Upload complete',
        file_id: 'abc',
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('falls back to a plain JSON response when no stream is provided', () => {
      const res = createMockRes();

      sendUploadSuccess(res, null, 'Upload complete', { file_id: 'abc' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Upload complete', file_id: 'abc' });
    });

    it('falls back to a plain JSON response when the stream is undefined', () => {
      const res = createMockRes();

      sendUploadSuccess(res, undefined, 'Upload complete', { file_id: 'abc' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Upload complete', file_id: 'abc' });
    });
  });
});