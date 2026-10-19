import { PassThrough, Readable } from 'node:stream';
import { pipeSegment, pipeToResponse } from './streams';

function failingSource(): Readable {
  return new Readable({
    read() {
      this.push(Buffer.from('partial'));
      this.destroy(new Error('socket reset'));
    },
  });
}

describe('pipeToResponse', () => {
  it('reports a mid-stream failure and tears the response down', async () => {
    const res = new PassThrough();
    res.resume();
    const onError = jest.fn();

    pipeToResponse(failingSource(), res, onError);
    await new Promise((resolve) => res.on('close', resolve));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'socket reset' }));
    expect(res.destroyed).toBe(true);
  });

  it('destroys the upstream when the client disconnects', async () => {
    const source = new PassThrough();
    const res = new PassThrough();

    pipeToResponse(source, res);
    res.destroy();
    await new Promise((resolve) => source.on('close', resolve));

    expect(source.destroyed).toBe(true);
  });
});

describe('pipeSegment', () => {
  it('resolves when the segment ends and leaves the response open', async () => {
    const res = new PassThrough();
    res.resume();

    await pipeSegment(Readable.from([Buffer.from('audio')]), res, { end: false });

    expect(res.writableEnded).toBe(false);
  });

  it('rejects when the segment fails', async () => {
    const res = new PassThrough();
    res.resume();

    await expect(pipeSegment(failingSource(), res, { end: false })).rejects.toThrow('socket reset');
  });

  it('rejects and stops the upstream when the client disconnects', async () => {
    const source = new PassThrough();
    const res = new PassThrough();
    const pending = pipeSegment(source, res, { end: false });

    res.destroy();

    await expect(pending).rejects.toThrow('Client disconnected');
    expect(source.destroyed).toBe(true);
  });

  it('rejects at once when the client left before the segment started', async () => {
    const source = new PassThrough();
    const res = new PassThrough();
    res.destroy();

    await expect(pipeSegment(source, res, { end: false })).rejects.toThrow('Client disconnected');
    expect(source.destroyed).toBe(true);
  });

  it('tears the response down when the segment fails mid-write', async () => {
    const res = new PassThrough();
    res.resume();

    await expect(pipeSegment(failingSource(), res, { end: false })).rejects.toThrow('socket reset');
    expect(res.destroyed).toBe(true);
  });

  it('rejects on a response-side error instead of leaving it unhandled', async () => {
    const source = new PassThrough();
    const res = new PassThrough();
    const pending = pipeSegment(source, res, { end: false });

    res.emit('error', new Error('write EPIPE'));

    await expect(pending).rejects.toThrow('write EPIPE');
    expect(source.destroyed).toBe(true);
  });

  it('keeps a response write error after a segment from going unhandled', async () => {
    const res = new PassThrough();
    res.resume();
    await pipeSegment(Readable.from([Buffer.from('audio')]), res, { end: false });

    expect(() => res.emit('error', new Error('write EPIPE'))).not.toThrow();
  });

  it('leaves a response with no audio sent yet open for an HTTP error', async () => {
    const res = Object.assign(new PassThrough(), { headersSent: false });
    res.resume();

    await expect(pipeSegment(failingSource(), res, { end: false })).rejects.toThrow('socket reset');
    expect(res.destroyed).toBe(false);
  });
});
