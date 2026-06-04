const { EventEmitter } = require('node:events');
const { SSE_HEARTBEAT_PAYLOAD, startSseHeartbeat, writeSseHeartbeat } = require('../sseHeartbeat');

function createResponse() {
  const res = new EventEmitter();
  res.writableEnded = false;
  res.destroyed = false;
  res.write = jest.fn();
  res.flush = jest.fn();
  return res;
}

describe('sseHeartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes SSE comment heartbeats at the configured interval', () => {
    const res = createResponse();

    startSseHeartbeat(res, 1000);
    jest.advanceTimersByTime(999);
    expect(res.write).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(res.write).toHaveBeenCalledWith(SSE_HEARTBEAT_PAYLOAD);
    expect(res.flush).toHaveBeenCalledTimes(1);
  });

  it('stops writing when the response finishes', () => {
    const res = createResponse();

    startSseHeartbeat(res, 1000);
    res.emit('finish');
    jest.advanceTimersByTime(1000);

    expect(res.write).not.toHaveBeenCalled();
  });

  it('stops writing when the client connection closes', () => {
    const res = createResponse();

    startSseHeartbeat(res, 1000);
    res.emit('close');
    jest.advanceTimersByTime(1000);

    expect(res.write).not.toHaveBeenCalled();
  });

  it('does not write to ended or destroyed responses', () => {
    const ended = createResponse();
    ended.writableEnded = true;
    const destroyed = createResponse();
    destroyed.destroyed = true;

    expect(writeSseHeartbeat(ended)).toBe(false);
    expect(writeSseHeartbeat(destroyed)).toBe(false);
    expect(ended.write).not.toHaveBeenCalled();
    expect(destroyed.write).not.toHaveBeenCalled();
  });
});
