import { act, renderHook } from '@testing-library/react';
import { DEFAULT_MIN_FILE_SIZE_KB } from 'librechat-data-provider';

let mockFileConfig: unknown = null;

jest.mock('~/data-provider', () => ({
  useGetFileConfig: jest.fn((options: { select?: (data: unknown) => unknown }) => ({
    data: options?.select ? options.select(mockFileConfig) : mockFileConfig,
  })),
}));

const mockResizeImage = jest.fn();

jest.mock('~/utils/imageResize', () => {
  const actual = jest.requireActual('~/utils/imageResize');
  return {
    ...actual,
    resizeImage: (...args: unknown[]) => mockResizeImage(...args),
    supportsClientResize: () => true,
  };
});

const makeImage = (sizeBytes: number, type = 'image/jpeg') => {
  const file = new File([''], 'photo.jpg', { type, lastModified: Date.now() });
  Object.defineProperty(file, 'size', { value: sizeBytes, writable: false });
  return file;
};

describe('useClientResize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileConfig = null;
  });

  const loadHook = async () => (await import('../useClientResize')).default;

  it('returns the original file when clientImageResize is disabled', async () => {
    mockFileConfig = { clientImageResize: { enabled: false } };
    const useClientResize = await loadHook();
    const { result } = renderHook(() => useClientResize());

    const file = makeImage(5 * 1024 * 1024);
    let outcome: { file: File; resized: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.resizeImageIfNeeded(file);
    });

    expect(outcome).toEqual({ file, resized: false });
    expect(mockResizeImage).not.toHaveBeenCalled();
  });

  it('skips files below the configured minFileSizeKB threshold', async () => {
    mockFileConfig = {
      clientImageResize: { enabled: true, minFileSizeKB: 1024 },
    };
    const useClientResize = await loadHook();
    const { result } = renderHook(() => useClientResize());

    const file = makeImage(150 * 1024);
    let outcome: { file: File; resized: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.resizeImageIfNeeded(file);
    });

    expect(outcome).toEqual({ file, resized: false });
    expect(mockResizeImage).not.toHaveBeenCalled();
  });

  it('resizes files at or above the configured minFileSizeKB threshold', async () => {
    mockFileConfig = {
      clientImageResize: {
        enabled: true,
        minFileSizeKB: 1024,
        maxWidth: 1900,
        maxHeight: 1900,
        quality: 0.92,
      },
    };
    const resizedFile = makeImage(512 * 1024);
    mockResizeImage.mockResolvedValueOnce({
      file: resizedFile,
      originalSize: 2 * 1024 * 1024,
      newSize: 512 * 1024,
      originalDimensions: { width: 2560, height: 1440 },
      newDimensions: { width: 1900, height: 1069 },
      compressionRatio: 0.25,
    });

    const useClientResize = await loadHook();
    const { result } = renderHook(() => useClientResize());

    const source = makeImage(2 * 1024 * 1024);
    let outcome: { file: File; resized: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.resizeImageIfNeeded(source);
    });

    expect(outcome?.resized).toBe(true);
    expect(outcome?.file).toBe(resizedFile);
    expect(mockResizeImage).toHaveBeenCalledWith(source, {
      maxWidth: 1900,
      maxHeight: 1900,
      quality: 0.92,
    });
  });

  it('falls back to the default threshold when minFileSizeKB is not configured', async () => {
    mockFileConfig = { clientImageResize: { enabled: true } };
    const useClientResize = await loadHook();
    const { result } = renderHook(() => useClientResize());

    const belowDefault = makeImage((DEFAULT_MIN_FILE_SIZE_KB - 1) * 1024);
    let belowOutcome: { file: File; resized: boolean } | undefined;
    await act(async () => {
      belowOutcome = await result.current.resizeImageIfNeeded(belowDefault);
    });

    expect(belowOutcome).toEqual({ file: belowDefault, resized: false });
    expect(mockResizeImage).not.toHaveBeenCalled();
  });
});
