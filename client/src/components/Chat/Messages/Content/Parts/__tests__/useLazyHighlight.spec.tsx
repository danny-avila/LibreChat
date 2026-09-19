import { act, renderHook } from '@testing-library/react';
import useLazyHighlight, { HIGHLIGHT_THROTTLE_MS } from '../useLazyHighlight';
import { useGetStartupConfig } from '~/data-provider';

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(() => ({ data: undefined })),
}));
const mockHighlight = jest.fn((_lang: string, code: string) => ({
  type: 'root',
  children: [{ type: 'text', value: code }],
}));

jest.mock('lowlight', () => ({
  __esModule: true,
  lowlight: {
    registered: () => true,
    highlight: (lang: string, code: string) => mockHighlight(lang, code),
    highlightAuto: (code: string) => mockHighlight('auto', code),
  },
}));

const flush = () => act(async () => Promise.resolve());

describe('useLazyHighlight', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockHighlight.mockClear();
    jest.mocked(useGetStartupConfig).mockReturnValue({ data: undefined } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ignores an in-flight highlight when the input changes', async () => {
    const { result, rerender } = renderHook(
      ({ code, lang }: { code: string; lang: string }) => useLazyHighlight(code, lang),
      { initialProps: { code: 'a', lang: 'js' } },
    );
    rerender({ code: 'b', lang: 'js' });

    await flush();
    expect(result.current).toBeNull();

    act(() => jest.advanceTimersByTime(HIGHLIGHT_THROTTLE_MS));
    await flush();
    expect(result.current).toEqual(['b']);
  });

  it('highlights the first value immediately', async () => {
    const { result } = renderHook(() => useLazyHighlight('a', 'js'));
    expect([null, ['a']]).toContainEqual(result.current);
    await flush();
    expect(result.current).toEqual(['a']);
  });

  it('throttles re-highlights while streaming and highlights the settled value once', async () => {
    const { result, rerender } = renderHook(({ code }) => useLazyHighlight(code, 'js'), {
      initialProps: { code: 'a' },
    });
    await flush();
    mockHighlight.mockClear();

    const chunks = ['ab', 'abc', 'abcd', 'abcde'];
    for (const code of chunks) {
      rerender({ code });
      act(() => jest.advanceTimersByTime(20));
    }
    expect(mockHighlight).not.toHaveBeenCalled();
    expect(result.current).toEqual(['a']);

    act(() => jest.advanceTimersByTime(HIGHLIGHT_THROTTLE_MS));
    await flush();
    expect(mockHighlight).toHaveBeenCalledTimes(1);
    expect(mockHighlight).toHaveBeenLastCalledWith('js', 'abcde');
    expect(result.current).toEqual(['abcde']);
  });
  it('uses the configured throttle interval', async () => {
    jest.mocked(useGetStartupConfig).mockReturnValue({
      data: { interface: { codeHighlightThrottleMs: 100 } },
    } as never);
    const { result, rerender } = renderHook(({ code }) => useLazyHighlight(code, 'js'), {
      initialProps: { code: 'a' },
    });
    await flush();
    mockHighlight.mockClear();

    rerender({ code: 'ab' });
    act(() => jest.advanceTimersByTime(99));
    expect(result.current).toEqual(['a']);
    act(() => jest.advanceTimersByTime(1));
    await flush();
    expect(result.current).toEqual(['ab']);
  });
  it('keeps the throttle window stable when the wall clock moves backwards', async () => {
    const { result, rerender } = renderHook(({ code }) => useLazyHighlight(code, 'js'), {
      initialProps: { code: 'a' },
    });
    await flush();
    mockHighlight.mockClear();

    rerender({ code: 'ab' });
    act(() => jest.setSystemTime(new Date(Date.now() - 60_000)));
    act(() => jest.advanceTimersByTime(HIGHLIGHT_THROTTLE_MS - 1));
    expect(result.current).toEqual(['a']);
    act(() => jest.advanceTimersByTime(1));
    await flush();
    expect(result.current).toEqual(['ab']);
  });


  it('clears immediately when code becomes empty', async () => {
    const { result, rerender } = renderHook(
      ({ code }: { code: string | undefined }) => useLazyHighlight(code, 'js'),
      { initialProps: { code: 'a' as string | undefined } },
    );
    await flush();
    rerender({ code: 'ab' });
    rerender({ code: undefined });
    expect(result.current).toBeNull();
    act(() => jest.advanceTimersByTime(HIGHLIGHT_THROTTLE_MS * 2));
    await flush();
    expect(result.current).toBeNull();
  });

  it('does not schedule work after unmount', async () => {
    const { rerender, unmount } = renderHook(({ code }) => useLazyHighlight(code, 'js'), {
      initialProps: { code: 'a' },
    });
    await flush();
    mockHighlight.mockClear();
    rerender({ code: 'ab' });
    unmount();
    act(() => jest.advanceTimersByTime(HIGHLIGHT_THROTTLE_MS * 2));
    await flush();
    expect(mockHighlight).not.toHaveBeenCalled();
  });
});
