import { renderHook, act } from '@testing-library/react';
import {
  megabyte,
  Constants,
  mergeFileConfig,
  EModelEndpoint,
  getEndpointFileConfig,
} from 'librechat-data-provider';

type MockUploadMutationOptions = {
  onSuccess?: (
    data: {
      temp_file_id: string;
      file_id: string;
      filepath: string;
      type: string;
      filename: string;
      source: string;
      embedded: boolean;
      height?: number;
      width?: number;
    },
    body: FormData,
  ) => void;
  onError?: (error: unknown, body: FormData) => void;
};

/** Mirrors a browser that can (or cannot) decode the bytes it was handed. */
let mockImageDecodes = true;

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = jest.fn();
  Object.defineProperty(global, 'Image', {
    writable: true,
    value: class {
      width = 640;
      height = 480;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_src: string) {
        queueMicrotask(() => (mockImageDecodes ? this.onload?.() : this.onerror?.()));
      }
    },
  });
});

const mockShowToast = jest.fn();
const mockSetFilesLoading = jest.fn();
const mockMutate = jest.fn();
const mockProcessFileForUpload = jest.fn(
  async (_file: File, _quality?: number, _onProgress?: (progress: number) => void) => _file,
);
const mockResizeImageIfNeeded = jest.fn(async (file: File) => ({ file, resized: false }));
const mockWaitForConfig = jest.fn((): Promise<void> => Promise.resolve());
const mockLocalize = jest.fn((key: string) => key);

const makeSizedFile = (name: string, type: string, size: number): File => {
  const file = new File(['content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

let mockConversation: Record<string, string | null | undefined> = {};
let mockFileConfig: ReturnType<typeof mergeFileConfig> | null = null;
let mockIsConfigPending = false;
let mockIsTemporary = false;
let mockUploadOptions: MockUploadMutationOptions = {};

jest.mock('~/Providers/ChatContext', () => ({
  useChatContext: jest.fn(() => ({
    files: new Map(),
    setFiles: jest.fn(),
    setFilesLoading: mockSetFilesLoading,
    conversation: mockConversation,
  })),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: jest.fn(() => ({
    showToast: mockShowToast,
  })),
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: jest.fn(() => jest.fn()),
  useRecoilValue: jest.fn(() => mockIsTemporary),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { isTemporary: { key: 'isTemporary' } },
  ephemeralAgentByConvoId: jest.fn(() => ({ key: 'mock' })),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({
    getQueryData: jest.fn(),
    refetchQueries: jest.fn(),
  })),
}));

jest.mock('~/data-provider', () => ({
  useGetFileConfig: jest.fn(() => ({ data: mockFileConfig })),
  useUploadFileMutation: jest.fn((opts: MockUploadMutationOptions) => {
    mockUploadOptions = opts;
    return { mutate: mockMutate };
  }),
}));

jest.mock('~/hooks/useLocalize', () => {
  const fn = jest.fn(() => mockLocalize) as jest.Mock & {
    TranslationKeys: Record<string, never>;
  };
  fn.TranslationKeys = {};
  return { __esModule: true, default: fn, TranslationKeys: {} };
});

jest.mock('../useDelayedUploadToast', () => ({
  useDelayedUploadToast: jest.fn(() => ({
    startUploadTimer: jest.fn(),
    clearUploadTimer: jest.fn(),
  })),
}));

jest.mock('~/utils/heicConverter', () => ({
  processFileForUpload: mockProcessFileForUpload,
}));

jest.mock('../useClientResize', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    isConfigPending: mockIsConfigPending,
    waitForConfig: mockWaitForConfig,
    resizeImageIfNeeded: mockResizeImageIfNeeded,
  })),
}));

const mockAddFile = jest.fn();
const mockReplaceFile = jest.fn();
const mockUpdateFileById = jest.fn();
const mockDeleteFileById = jest.fn();

jest.mock('../useUpdateFiles', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    addFile: mockAddFile,
    replaceFile: mockReplaceFile,
    updateFileById: mockUpdateFileById,
    deleteFileById: mockDeleteFileById,
  })),
}));

jest.mock('~/utils', () => {
  const { validateFileSizes, validateFileDuplicates } = jest.requireActual('~/utils/files');
  return {
    logger: { log: jest.fn() },
    validateFiles: jest.fn(() => true),
    validateFileSizes: jest.fn(validateFileSizes),
    validateFileDuplicates: jest.fn(validateFileDuplicates),
    cachePreview: jest.fn(),
    getCachedPreview: jest.fn(() => undefined),
    removePreviewEntry: jest.fn(),
  };
});

const mockValidateFiles = jest.requireMock('~/utils').validateFiles;
const mockValidateFileSizes = jest.requireMock('~/utils').validateFileSizes;
const mockValidateFileDuplicates = jest.requireMock('~/utils').validateFileDuplicates;

describe('useFileHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateFiles.mockImplementation(() => true);
    mockValidateFileSizes.mockImplementation(jest.requireActual('~/utils/files').validateFileSizes);
    mockValidateFileDuplicates.mockImplementation(
      jest.requireActual('~/utils/files').validateFileDuplicates,
    );
    mockProcessFileForUpload.mockImplementation(async (file: File) => file);
    mockResizeImageIfNeeded.mockImplementation(async (file: File) => ({ file, resized: false }));
    mockWaitForConfig.mockResolvedValue(undefined);
    mockConversation = {};
    mockFileConfig = null;
    mockIsConfigPending = false;
    mockIsTemporary = false;
    mockImageDecodes = true;
    mockUploadOptions = {};
  });

  const loadHook = async () => (await import('../useFileHandling')).default;

  describe('endpointOverride', () => {
    it('clears the loading state when file validation throws', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockValidateFiles.mockImplementationOnce(() => {
        throw new Error('invalid file config');
      });

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles([new File(['hello'], 'test.txt', { type: 'text/plain' })]);
      });

      expect(mockSetFilesLoading).toHaveBeenCalledWith(false);
      expect(mockMutate).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('uploads non-HEIC images without running HEIC conversion', async () => {
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const imageFile = new File(['maybe-heic'], 'photo.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.handleFiles([imageFile]);
      });

      expect(mockProcessFileForUpload).not.toHaveBeenCalled();
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('waits for a pending resize config before processing an upload', async () => {
      let resolveConfig: () => void = () => undefined;
      mockIsConfigPending = true;
      mockWaitForConfig.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveConfig = resolve;
          }),
      );
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());
      const imageFile = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
      let handlingPromise: Promise<boolean> = Promise.resolve(false);

      await act(async () => {
        handlingPromise = result.current.handleFiles([imageFile]);
        await Promise.resolve();
      });

      expect(mockWaitForConfig).toHaveBeenCalledTimes(1);
      expect(mockValidateFiles).not.toHaveBeenCalled();
      expect(mockResizeImageIfNeeded).not.toHaveBeenCalled();
      expect(mockMutate).not.toHaveBeenCalled();

      await act(async () => {
        resolveConfig();
        await handlingPromise;
        await Promise.resolve();
      });

      expect(mockValidateFiles).toHaveBeenCalledTimes(1);
      expect(mockResizeImageIfNeeded).toHaveBeenCalledWith(imageFile);
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('abandons a waiting upload when its composer is gone', async () => {
      let resolveConfig: () => void = () => undefined;
      mockIsConfigPending = true;
      mockWaitForConfig.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveConfig = resolve;
          }),
      );
      const { default: useFileHandling, hasInFlightUpload } = await import('../useFileHandling');
      const { result } = renderHook(() => useFileHandling());
      const pastedFile = makeSizedFile('pasted-text.txt', 'text/plain', 4096);
      let composerIsCurrent = true;
      let handlingPromise: Promise<boolean> = Promise.resolve(false);

      await act(async () => {
        handlingPromise = result.current.handleFiles([pastedFile], undefined, {
          fileId: 'paste-1',
          shouldCommit: () => composerIsCurrent,
        });
        await Promise.resolve();
      });

      expect(hasInFlightUpload('paste-1')).toBe(true);
      composerIsCurrent = false;
      let accepted: boolean | undefined;

      await act(async () => {
        resolveConfig();
        accepted = await handlingPromise;
      });

      expect(accepted).toBe(false);
      expect(hasInFlightUpload('paste-1')).toBe(false);
      expect(mockValidateFiles).not.toHaveBeenCalled();
      expect(mockMutate).not.toHaveBeenCalled();
      expect(mockSetFilesLoading).toHaveBeenCalledWith(false);
    });

    it('processes uploads when a resize config error has settled', async () => {
      mockIsConfigPending = false;
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());
      const imageFile = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.handleFiles([imageFile]);
        await Promise.resolve();
      });

      expect(mockWaitForConfig).not.toHaveBeenCalled();
      expect(mockResizeImageIfNeeded).toHaveBeenCalledWith(imageFile);
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('accepts an image that resizing brings under the individual size limit', async () => {
      mockFileConfig = mergeFileConfig({
        endpoints: { default: { fileSizeLimit: 5 } },
      });
      const originalFile = makeSizedFile('photo.jpg', 'image/jpeg', 6 * megabyte);
      const resizedFile = makeSizedFile('photo.jpg', 'image/jpeg', 4 * megabyte);
      mockResizeImageIfNeeded.mockResolvedValueOnce({ file: resizedFile, resized: true });
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles([originalFile]);
        await Promise.resolve();
      });

      expect(mockValidateFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          fileList: [originalFile],
          skipSizeValidation: true,
        }),
      );
      expect(mockValidateFileSizes).toHaveBeenCalledWith(
        expect.objectContaining({ fileList: [resizedFile] }),
      );
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('rejects an image still at the individual size limit after resizing', async () => {
      jest.useFakeTimers();
      try {
        mockFileConfig = mergeFileConfig({
          endpoints: { default: { fileSizeLimit: 5 } },
        });
        const originalFile = makeSizedFile('photo.jpg', 'image/jpeg', 6 * megabyte);
        const resizedFile = makeSizedFile('photo.jpg', 'image/jpeg', 5 * megabyte);
        mockResizeImageIfNeeded.mockResolvedValueOnce({ file: resizedFile, resized: true });
        const useFileHandling = await loadHook();
        const { result } = renderHook(() => useFileHandling());

        await act(async () => {
          await result.current.handleFiles([originalFile]);
        });
        await act(async () => {
          jest.advanceTimersByTime(250);
        });

        expect(mockValidateFileSizes).toHaveBeenCalledWith(
          expect.objectContaining({ fileList: [resizedFile] }),
        );
        expect(mockMutate).not.toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'File size limit exceeded: 5 MB',
          status: 'error',
          duration: 5000,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('applies the total size limit to the complete transformed batch', async () => {
      jest.useFakeTimers();
      try {
        mockFileConfig = mergeFileConfig({
          endpoints: { default: { fileSizeLimit: 10, totalSizeLimit: 7 } },
        });
        const originals = [
          makeSizedFile('one.jpg', 'image/jpeg', 6 * megabyte),
          makeSizedFile('two.jpg', 'image/jpeg', 6 * megabyte),
        ];
        const resizedFiles = [
          makeSizedFile('one.jpg', 'image/jpeg', 4 * megabyte),
          makeSizedFile('two.jpg', 'image/jpeg', 4 * megabyte),
        ];
        mockResizeImageIfNeeded
          .mockResolvedValueOnce({ file: resizedFiles[0], resized: true })
          .mockResolvedValueOnce({ file: resizedFiles[1], resized: true });
        const useFileHandling = await loadHook();
        const { result } = renderHook(() => useFileHandling());

        await act(async () => {
          await result.current.handleFiles(originals);
        });
        await act(async () => {
          jest.advanceTimersByTime(250);
        });

        expect(mockValidateFileSizes).toHaveBeenCalledWith(
          expect.objectContaining({ fileList: resizedFiles }),
        );
        expect(mockMutate).not.toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'Total file size limit exceeded: 7 MB',
          status: 'error',
          duration: 5000,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('uploads the selected file when the input is reset before processing starts', async () => {
      const selectedFile = makeSizedFile('notes.txt', 'text/plain', 1024);
      /** Mirrors the live `FileList` an input clears in place when its value is reset */
      const liveFiles = [selectedFile];
      const target = {
        files: liveFiles as unknown as FileList,
        get value() {
          return '';
        },
        set value(_next: string) {
          liveFiles.length = 0;
        },
      };
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        result.current.handleFileChange({
          stopPropagation: jest.fn(),
          target,
        } as unknown as React.ChangeEvent<HTMLInputElement>);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(target.files).toHaveLength(0);
      expect(mockValidateFiles).toHaveBeenCalledWith(
        expect.objectContaining({ fileList: [selectedFile] }),
      );
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('rejects a reattached image that resizing turns into a duplicate', async () => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      try {
        const originalFile = makeSizedFile('photo.jpg', 'image/jpeg', 6 * megabyte);
        mockResizeImageIfNeeded.mockImplementation(async () => ({
          file: makeSizedFile('photo.jpg', 'image/jpeg', 4 * megabyte),
          resized: true,
        }));
        const useFileHandling = await loadHook();
        const { result } = renderHook(() => useFileHandling());

        await act(async () => {
          await result.current.handleFiles([originalFile]);
          await Promise.resolve();
        });

        expect(mockMutate).toHaveBeenCalledTimes(1);

        await act(async () => {
          await result.current.handleFiles([originalFile]);
          await Promise.resolve();
        });
        await act(async () => {
          jest.advanceTimersByTime(250);
        });

        expect(mockValidateFileDuplicates).toHaveBeenCalledTimes(2);
        expect(mockMutate).toHaveBeenCalledTimes(1);
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_error_files_dupe',
          status: 'error',
          duration: 5000,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not retain reservations when uploads target a custom file setter', async () => {
      mockFileConfig = mergeFileConfig({
        endpoints: { default: { fileSizeLimit: 10, totalSizeLimit: 7 } },
      });
      const customSetter = jest.fn();
      const useFileHandling = await loadHook();
      const { result, rerender } = renderHook(() => useFileHandling({ fileSetter: customSetter }));

      await act(async () => {
        await result.current.handleFiles([makeSizedFile('one.txt', 'text/plain', 4 * megabyte)]);
      });
      /** The custom setter owns the uploads, so a rerender restores the observable chat state */
      rerender();
      await act(async () => {
        await result.current.handleFiles([makeSizedFile('two.txt', 'text/plain', 4 * megabyte)]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(2);
    });

    it('starts the config wait for queued batches without stacking the timeouts', async () => {
      mockIsConfigPending = true;
      let releaseConfig: () => void = () => undefined;
      const configGate = new Promise<void>((resolve) => {
        releaseConfig = resolve;
      });
      mockWaitForConfig.mockImplementation(() => configGate);
      const sharedState = {
        files: new Map(),
        setFiles: jest.fn(),
        setFilesLoading: mockSetFilesLoading,
      };
      const { useFileHandlingNoChatContext } = await import('../useFileHandling');
      const menu = renderHook(() => useFileHandlingNoChatContext(undefined, sharedState));
      const composer = renderHook(() => useFileHandlingNoChatContext(undefined, sharedState));

      let uploads: Promise<boolean[]> = Promise.resolve([]);
      await act(async () => {
        uploads = Promise.all([
          menu.result.current.handleFiles([makeSizedFile('one.txt', 'text/plain', 1024)]),
          composer.result.current.handleFiles([makeSizedFile('two.txt', 'text/plain', 1024)]),
        ]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockWaitForConfig).toHaveBeenCalledTimes(2);

      await act(async () => {
        releaseConfig();
        await uploads;
      });

      expect(mockMutate).toHaveBeenCalledTimes(2);
    });

    it('shares the total size limit across hook instances writing the same files', async () => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      try {
        mockFileConfig = mergeFileConfig({
          endpoints: { default: { fileSizeLimit: 10, totalSizeLimit: 7 } },
        });
        const sharedState = {
          files: new Map(),
          setFiles: jest.fn(),
          setFilesLoading: mockSetFilesLoading,
        };
        const { useFileHandlingNoChatContext } = await import('../useFileHandling');
        const menu = renderHook(() => useFileHandlingNoChatContext(undefined, sharedState));
        const composer = renderHook(() => useFileHandlingNoChatContext(undefined, sharedState));

        await act(async () => {
          await Promise.all([
            menu.result.current.handleFiles([makeSizedFile('one.txt', 'text/plain', 4 * megabyte)]),
            composer.result.current.handleFiles([
              makeSizedFile('two.txt', 'text/plain', 4 * megabyte),
            ]),
          ]);
        });
        await act(async () => {
          jest.advanceTimersByTime(250);
        });

        expect(mockMutate).toHaveBeenCalledTimes(1);
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'Total file size limit exceeded: 7 MB',
          status: 'error',
          duration: 5000,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('shares the total size limit across concurrent upload batches', async () => {
      jest.useFakeTimers();
      try {
        mockFileConfig = mergeFileConfig({
          endpoints: { default: { fileSizeLimit: 10, totalSizeLimit: 7 } },
        });
        const firstFile = makeSizedFile('one.jpg', 'image/jpeg', 4 * megabyte);
        const secondFile = makeSizedFile('two.jpg', 'image/jpeg', 4 * megabyte);
        const useFileHandling = await loadHook();
        const { result } = renderHook(() => useFileHandling());

        await act(async () => {
          await Promise.all([
            result.current.handleFiles([firstFile]),
            result.current.handleFiles([secondFile]),
          ]);
          await Promise.resolve();
        });
        await act(async () => {
          jest.advanceTimersByTime(250);
        });

        expect(mockValidateFileSizes).toHaveBeenCalledTimes(2);
        expect(mockValidateFileSizes.mock.calls[1][0].files.size).toBe(1);
        expect(mockMutate).toHaveBeenCalledTimes(1);
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'Total file size limit exceeded: 7 MB',
          status: 'error',
          duration: 5000,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('localizes the image resize success toast with size details', async () => {
      const originalFile = new File(['original'], 'photo.jpg', { type: 'image/jpeg' });
      const resizedFile = new File(['resized'], 'photo.jpg', { type: 'image/jpeg' });
      mockResizeImageIfNeeded.mockImplementationOnce(async () => ({
        file: resizedFile,
        resized: true,
        result: {
          file: resizedFile,
          originalSize: 2 * 1024 * 1024,
          newSize: 1024 * 1024,
          originalDimensions: { width: 2400, height: 1600 },
          newDimensions: { width: 1200, height: 800 },
          compressionRatio: 0.5,
        },
      }));

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles([originalFile]);
      });

      expect(mockLocalize).toHaveBeenCalledWith('com_info_image_resized', {
        0: '2.0',
        1: '1.0',
        2: 50,
      });
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'com_info_image_resized',
        status: 'success',
        duration: 3000,
      });
    });

    it('uses conversation endpoint when no override is provided', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockValidateFiles).toHaveBeenCalledTimes(1);
      const validateCall = mockValidateFiles.mock.calls[0][0];
      const configResult = getEndpointFileConfig({
        endpoint: 'openAI',
        endpointType: 'custom',
        fileConfig: null,
      });
      expect(validateCall.endpointFileConfig).toEqual(configResult);
    });

    it('uses endpointOverride for validation instead of conversation endpoint', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() =>
        useFileHandling({ endpointOverride: EModelEndpoint.agents }),
      );

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockValidateFiles).toHaveBeenCalledTimes(1);
      const validateCall = mockValidateFiles.mock.calls[0][0];
      const agentsConfig = getEndpointFileConfig({
        endpoint: EModelEndpoint.agents,
        endpointType: EModelEndpoint.agents,
        fileConfig: null,
      });
      expect(validateCall.endpointFileConfig).toEqual(agentsConfig);
    });

    it('falls back to conversation endpoint when endpointOverride is undefined', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'anthropic',
        endpointType: undefined,
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling({ endpointOverride: undefined }));

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockValidateFiles).toHaveBeenCalledTimes(1);
      const validateCall = mockValidateFiles.mock.calls[0][0];
      const anthropicConfig = getEndpointFileConfig({
        endpoint: 'anthropic',
        endpointType: undefined,
        fileConfig: null,
      });
      expect(validateCall.endpointFileConfig).toEqual(anthropicConfig);
    });

    it('sends correct endpoint in upload form data when override is set', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() =>
        useFileHandling({
          endpointOverride: EModelEndpoint.agents,
          additionalMetadata: { agent_id: 'agent-123' },
        }),
      );

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('endpoint')).toBe(EModelEndpoint.agents);
      expect(formData.get('endpointType')).toBe(EModelEndpoint.agents);
      expect(formData.get('conversationId')).toBeNull();
    });

    it('does not enter assistants upload path when override is agents', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'assistants',
        endpointType: 'assistants',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() =>
        useFileHandling({
          endpointOverride: EModelEndpoint.agents,
          additionalMetadata: { agent_id: 'agent-123' },
        }),
      );

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('endpoint')).toBe(EModelEndpoint.agents);
      expect(formData.get('message_file')).toBeNull();
      expect(formData.get('version')).toBeNull();
      expect(formData.get('model')).toBeNull();
      expect(formData.get('assistant_id')).toBeNull();
    });

    it('enters assistants path without override when conversation is assistants', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'assistants',
        endpointType: 'assistants',
        assistant_id: 'asst-456',
        model: 'gpt-4',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('endpoint')).toBe('assistants');
      expect(formData.get('message_file')).toBe('true');
    });

    it('falls back to "default" when no conversation endpoint and no override', async () => {
      mockConversation = {
        conversationId: Constants.NEW_CONVO as string,
        endpoint: null,
        endpointType: undefined,
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('endpoint')).toBe('default');
      expect(formData.get('conversationId')).toBeNull();
    });

    it('sends temporary flag for temporary chat uploads', async () => {
      mockIsTemporary = true;
      mockConversation = {
        conversationId: Constants.NEW_CONVO as string,
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('conversationId')).toBeNull();
      expect(formData.get('isTemporary')).toBe('true');
    });

    it('does not send temporary flag for assistant builder uploads', async () => {
      mockIsTemporary = true;
      mockConversation = {
        conversationId: 'temporary-convo',
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() =>
        useFileHandling({
          additionalMetadata: { assistant_id: 'asst-123' },
        }),
      );

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('assistant_id')).toBe('asst-123');
      expect(formData.get('conversationId')).toBeNull();
      expect(formData.get('isTemporary')).toBeNull();
    });

    it('does not send temporary flag for agent builder uploads', async () => {
      mockIsTemporary = true;
      mockConversation = {
        conversationId: 'temporary-convo',
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() =>
        useFileHandling({
          endpointOverride: EModelEndpoint.agents,
          additionalMetadata: { agent_id: 'agent-123' },
        }),
      );

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('agent_id')).toBe('agent-123');
      expect(formData.get('conversationId')).toBeNull();
      expect(formData.get('isTemporary')).toBeNull();
    });

    it('awaits HEIC conversion before uploading the converted file', async () => {
      const convertedFile = new File(['jpeg data'], 'photo.jpg', { type: 'image/jpeg' });
      mockProcessFileForUpload.mockImplementationOnce(
        async (_file: File, _quality?: number, onProgress?: (progress: number) => void) => {
          onProgress?.(1);
          return convertedFile;
        },
      );

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const heicFile = new File(['heic data'], 'photo.bin', { type: 'image/heic' });

      await act(async () => {
        await result.current.handleFiles([heicFile]);
      });

      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'com_info_heic_converting',
        status: 'info',
        duration: 3000,
      });
      expect(mockProcessFileForUpload).toHaveBeenCalledWith(heicFile, 0.9, expect.any(Function));
      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      const uploadedFile = formData.get('file') as File;
      expect(uploadedFile.name).toBe('photo.jpg');
      expect(uploadedFile.type).toBe('image/jpeg');
    });
  });

  /** Callers gate success messaging on this result, so a rejected upload must not report true */
  describe('acceptance result', () => {
    it('resolves false when validation rejects the files', async () => {
      mockValidateFiles.mockImplementationOnce(() => false);

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await result.current.handleFiles([
          new File(['hello'], 'dupe.txt', { type: 'text/plain' }),
        ]);
      });

      expect(accepted).toBe(false);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('resolves false when validation throws', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockValidateFiles.mockImplementationOnce(() => {
        throw new Error('invalid file config');
      });

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await result.current.handleFiles([
          new File(['hello'], 'test.txt', { type: 'text/plain' }),
        ]);
      });

      expect(accepted).toBe(false);
      consoleError.mockRestore();
    });

    it('resolves true when the files are accepted', async () => {
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await result.current.handleFiles([
          new File(['hello'], 'notes.txt', { type: 'text/plain' }),
        ]);
      });

      expect(accepted).toBe(true);
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('uses a preassigned file id and marks it in flight before the config wait', async () => {
      mockIsConfigPending = true;
      let releaseConfig!: () => void;
      mockWaitForConfig.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseConfig = resolve;
          }),
      );
      const assignedFileId = 'preassigned-file';
      const { default: useFileHandling, hasInFlightUpload } = await import('../useFileHandling');
      const { result } = renderHook(() => useFileHandling());

      let acceptedPromise!: Promise<boolean>;
      act(() => {
        acceptedPromise = result.current.handleFiles(
          [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
          undefined,
          { fileId: assignedFileId },
        );
      });

      expect(hasInFlightUpload(assignedFileId)).toBe(true);

      await act(async () => {
        releaseConfig();
        await acceptedPromise;
      });

      const uploadBody = mockMutate.mock.calls[0][0] as FormData;
      expect(uploadBody.get('file_id')).toBe(assignedFileId);
    });

    it('clears a preassigned file id when validation rejects the files', async () => {
      mockValidateFiles.mockImplementationOnce(() => false);
      const assignedFileId = 'rejected-preassigned-file';
      const { default: useFileHandling, hasInFlightUpload } = await import('../useFileHandling');
      const { result } = renderHook(() => useFileHandling());

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await result.current.handleFiles(
          [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
          undefined,
          { fileId: assignedFileId },
        );
      });

      expect(accepted).toBe(false);
      expect(hasInFlightUpload(assignedFileId)).toBe(false);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('reports the temporary id at upload start and success', async () => {
      const onStart = jest.fn();
      const onSuccess = jest.fn();
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles(
          [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
          undefined,
          { onStart, onSuccess },
        );
      });

      const uploadBody = mockMutate.mock.calls[0][0] as FormData;
      const fileId = uploadBody.get('file_id') as string;
      expect(onStart).toHaveBeenCalledWith(fileId);

      act(() => {
        mockUploadOptions.onSuccess?.(
          {
            temp_file_id: fileId,
            file_id: 'saved-file-id',
            filepath: '/files/notes.txt',
            type: 'text/plain',
            filename: 'notes.txt',
            source: 'local',
            embedded: false,
          },
          uploadBody,
        );
      });

      expect(onSuccess).toHaveBeenCalledWith(fileId);
    });

    it('resolves false when every file fails preprocessing', async () => {
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      mockProcessFileForUpload.mockRejectedValue(new Error('HEIC conversion failed'));

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await result.current.handleFiles([
          new File(['first'], 'first.heic', { type: 'image/heic' }),
          new File(['second'], 'second.heic', { type: 'image/heic' }),
        ]);
      });

      expect(accepted).toBe(false);
      expect(mockProcessFileForUpload).toHaveBeenCalledTimes(2);
      expect(mockMutate).not.toHaveBeenCalled();
      consoleLog.mockRestore();
    });

    it('runs the matching recovery when the first of two concurrent uploads fails', async () => {
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const firstRecovery = jest.fn();
      const secondRecovery = jest.fn();
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles(
          [new File(['first'], 'pasted-text.txt', { type: 'text/plain' })],
          undefined,
          { onError: firstRecovery },
        );
        await result.current.handleFiles(
          [new File(['second'], 'pasted-text-2.txt', { type: 'text/plain' })],
          undefined,
          { onError: secondRecovery },
        );
      });

      expect(mockMutate).toHaveBeenCalledTimes(2);
      const firstUploadBody = mockMutate.mock.calls[0][0] as FormData;

      act(() => mockUploadOptions.onError?.(new Error('first upload failed'), firstUploadBody));

      expect(firstRecovery).toHaveBeenCalledTimes(1);
      expect(secondRecovery).not.toHaveBeenCalled();

      act(() => mockUploadOptions.onError?.(new Error('first upload failed'), firstUploadBody));
      expect(firstRecovery).toHaveBeenCalledTimes(1);
      consoleLog.mockRestore();
    });

    it('does not recover pasted text after a separate file form removes the pending attachment', async () => {
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const recovery = jest.fn();
      const { default: useFileHandling, useFileHandlingNoChatContext } = await import(
        '../useFileHandling'
      );
      const { result: uploadResult } = renderHook(() => useFileHandling());

      await act(async () => {
        await uploadResult.current.handleFiles(
          [new File(['pasted text'], 'pasted-text.txt', { type: 'text/plain' })],
          undefined,
          { onError: recovery },
        );
      });

      const uploadBody = mockMutate.mock.calls[0][0] as FormData;
      const uploadOptions = mockUploadOptions;
      const fileId = uploadBody.get('file_id') as string;
      const { result: removalResult } = renderHook(() =>
        useFileHandlingNoChatContext(undefined, {
          files: new Map(),
          setFiles: jest.fn(),
        }),
      );

      act(() => {
        removalResult.current.abortUpload(fileId);
      });
      act(() => uploadOptions.onError?.(new Error('upload failed after removal'), uploadBody));

      expect(recovery).not.toHaveBeenCalled();
      consoleLog.mockRestore();
    });
  });
  describe('stalled attachments', () => {
    /**
     * The upload only starts once the browser has decoded the image, so a decode
     * it refuses must not leave the attachment parked below `progress: 1` — the
     * composer reads that as "still uploading" and disables send for the rest of
     * the session.
     */
    it('drops an image the browser cannot decode instead of parking it mid-upload', async () => {
      mockImageDecodes = false;
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles([
          new File(['broken'], 'photo.png', { type: 'image/png' }),
        ]);
      });
      await act(async () => {
        await Promise.resolve();
      });

      const addedFile = mockAddFile.mock.calls[0][0] as { file_id: string };
      expect(mockMutate).not.toHaveBeenCalled();
      expect(mockDeleteFileById).toHaveBeenCalledWith(addedFile.file_id);
    });

    it('reports the failure through the upload lifecycle when a decode fails', async () => {
      mockImageDecodes = false;
      const onError = jest.fn();
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles(
          [new File(['broken'], 'photo.png', { type: 'image/png' })],
          undefined,
          { fileId: 'pending-paste-id', onError },
        );
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(onError).toHaveBeenCalledWith('pending-paste-id');
    });

    /**
     * Every client-side handle for an upload is keyed by the id the request was
     * sent with; `temp_file_id` is only the server's echo of it. Reconciling
     * against the echo strands the attachment when the two disagree.
     */
    it('keys the completed attachment temporary id to the id the request was sent with', async () => {
      jest.useFakeTimers();
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles([
          new File(['hello'], 'notes.txt', { type: 'text/plain' }),
        ]);
      });

      const uploadBody = mockMutate.mock.calls[0][0] as FormData;
      const fileId = uploadBody.get('file_id') as string;

      act(() => {
        mockUploadOptions.onSuccess?.(
          {
            temp_file_id: 'an-id-the-client-never-sent',
            file_id: 'saved-file-id',
            filepath: '/files/notes.txt',
            type: 'text/plain',
            filename: 'notes.txt',
            source: 'local',
            embedded: false,
          },
          uploadBody,
        );
      });
      act(() => {
        jest.runAllTimers();
      });
      jest.useRealTimers();

      /** Removal deletes by the value's own ids, so a temporary id that is not the
       * map key leaves a chip the user cannot clear. */
      const [, completion] = mockUpdateFileById.mock.calls.at(-1) as [string, { progress: number }];
      expect(completion).toMatchObject({ progress: 1, temp_file_id: fileId });
      consoleLog.mockRestore();
    });

    it('releases the upload reservation when a decode fails', async () => {
      /** A stable setter so both batches share one upload scope, and a file map that
       * never observes the file — the render that would release the reservation
       * cannot happen once the failed decode has removed it. */
      const sharedState = {
        files: new Map(),
        setFiles: jest.fn(),
        setFilesLoading: mockSetFilesLoading,
      };
      const { useFileHandlingNoChatContext } = await import('../useFileHandling');
      const { result, rerender } = renderHook(() =>
        useFileHandlingNoChatContext(undefined, sharedState),
      );
      const pick = () => new File(['broken'], 'photo.png', { type: 'image/png' });

      mockImageDecodes = false;
      await act(async () => {
        await result.current.handleFiles([pick()]);
      });
      await act(async () => {
        await Promise.resolve();
      });

      rerender();
      mockValidateFileDuplicates.mockClear();
      mockImageDecodes = true;
      await act(async () => {
        await result.current.handleFiles([pick()]);
      });

      /** A reservation the failed decode left behind is merged into the next batch's
       * validation, so re-picking the same file reads as a duplicate and its size
       * keeps counting against the composer's limits. */
      const [{ files: validatedAgainst }] = mockValidateFileDuplicates.mock.calls[0];
      expect(validatedAgainst.size).toBe(0);
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('completes the attachment against the id the request was sent with', async () => {
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      await act(async () => {
        await result.current.handleFiles([
          new File(['hello'], 'notes.txt', { type: 'text/plain' }),
        ]);
      });

      const uploadBody = mockMutate.mock.calls[0][0] as FormData;
      const fileId = uploadBody.get('file_id') as string;

      act(() => {
        mockUploadOptions.onSuccess?.(
          {
            temp_file_id: 'an-id-the-client-never-sent',
            file_id: 'saved-file-id',
            filepath: '/files/notes.txt',
            type: 'text/plain',
            filename: 'notes.txt',
            source: 'local',
            embedded: false,
          },
          uploadBody,
        );
      });

      const updatedIds = mockUpdateFileById.mock.calls.map(([id]) => id);
      expect(updatedIds).toContain(fileId);
      expect(updatedIds).not.toContain('an-id-the-client-never-sent');
      consoleLog.mockRestore();
    });
  });
});
