import { act, renderHook } from '@testing-library/react';
import { ScreenshotProvider, useScreenshot } from './ScreenshotContext';

const mockToCanvas = jest.fn();
const mockCompleteProgressiveRowMounts = jest.fn();

jest.mock('html-to-image', () => ({ toCanvas: (...args: unknown[]) => mockToCanvas(...args) }));
jest.mock('~/hooks/Messages/useProgressiveRowMount', () => ({
  completeProgressiveRowMounts: () => mockCompleteProgressiveRowMounts(),
}));

describe('ScreenshotContext', () => {
  it('aborts when the conversation target changes while rows settle', async () => {
    let resolveCompletion = (_release: () => void) => {};
    mockCompleteProgressiveRowMounts.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveCompletion = resolve;
      }),
    );
    const release = jest.fn();
    const { result } = renderHook(() => useScreenshot(), { wrapper: ScreenshotProvider });
    const target = document.createElement('div');
    target.dataset.screenshotKey = 'conversation-a';
    document.body.appendChild(target);
    const ref = result.current.screenshotTargetRef;
    if (ref && !(ref instanceof Function)) {
      (ref as { current: HTMLDivElement | null }).current = target;
    }

    let capture = Promise.resolve(new Blob());
    act(() => {
      capture = result.current.captureScreenshot();
    });
    let captureError: unknown;
    const handledCapture = capture.catch((error: unknown) => {
      captureError = error;
    });
    target.dataset.screenshotKey = 'conversation-b';
    await act(async () => resolveCompletion(release));

    await handledCapture;
    expect(captureError).toEqual(
      expect.objectContaining({
        message: 'Screenshot target changed while preparing the capture.',
      }),
    );
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockToCanvas).not.toHaveBeenCalled();
  });
});
