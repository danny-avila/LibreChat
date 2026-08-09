import { EventEmitter } from 'events';
import { withParserAdmission } from '../documents/nativeProcess';
import { extractTextIsolated } from './native';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

const mockSpawn = jest.requireMock<{ spawn: jest.Mock }>('child_process').spawn;

class TestChild extends EventEmitter {
  killed = false;

  readonly kill = jest.fn((_signal?: NodeJS.Signals | number) => {
    this.killed = true;
    return true;
  });

  readonly send = jest.fn((_message: object, callback?: (error: Error | null) => void): boolean => {
    callback?.(null);
    return true;
  });
}

describe('pdfInspector child isolation', () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockSpawn.mockReset();
  });

  test('turns a native child abort into a rejection in the API process', async () => {
    const child = new TestChild();
    child.send.mockImplementationOnce((_message, callback) => {
      callback?.(null);
      queueMicrotask(() => child.emit('exit', null, 'SIGABRT'));
      return true;
    });
    mockSpawn.mockReturnValue(child);

    await expect(extractTextIsolated('/tmp/hostile.pdf')).rejects.toThrow(
      'pdf-inspector text child exited from signal SIGABRT',
    );
  });

  test('forcibly kills a synchronous native parse at the timeout', async () => {
    jest.useFakeTimers();
    const child = new TestChild();
    mockSpawn.mockReturnValue(child);

    const extraction = extractTextIsolated('/tmp/hanging.pdf');
    const failure = extraction.catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toEqual(new Error('pdf-inspector text timed out after 30000ms'));
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  /**
   * Admission wraps the whole document parse, not the child spawn: a PDF is a child,
   * then in-process pdfjs recovery, then possibly a second child, and a slot released
   * at the first child's exit would leave the recovery running outside the cap. The
   * burst is driven through that wrapper because it is what production holds.
   */
  test('limits native parser children across a concurrent burst', async () => {
    const children = [new TestChild(), new TestChild(), new TestChild()];
    children.forEach((child) => mockSpawn.mockReturnValueOnce(child));

    const extractions = [
      withParserAdmission(() => extractTextIsolated('/tmp/one.pdf')),
      withParserAdmission(() => extractTextIsolated('/tmp/two.pdf')),
      withParserAdmission(() => extractTextIsolated('/tmp/three.pdf')),
    ];
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockSpawn).toHaveBeenCalledTimes(2);

    children[0].emit('message', { ok: true, result: { text: 'one' } });
    await expect(extractions[0]).resolves.toBe('one');
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockSpawn).toHaveBeenCalledTimes(3);

    children[1].emit('message', { ok: true, result: { text: 'two' } });
    children[2].emit('message', { ok: true, result: { text: 'three' } });
    await expect(Promise.all(extractions.slice(1))).resolves.toEqual(['two', 'three']);
  });
});
