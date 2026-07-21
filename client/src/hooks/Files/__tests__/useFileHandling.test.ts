import { renderHook, act } from '@testing-library/react';
import { Constants, EModelEndpoint, getEndpointFileConfig } from 'librechat-data-provider';

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = jest.fn();
  Object.defineProperty(global, 'Image', {
    writable: true,
    value: class {
      width = 640;
      height = 480;
      onload: (() => void) | null = null;

      set src(_src: string) {
        queueMicrotask(() => this.onload?.());
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
const mockLocalize = jest.fn((key: string) => key);

let mockConversation: Record<string, string | null | undefined> = {};
let mockIsTemporary = false;

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
  useGetFileConfig: jest.fn(() => ({ data: null })),
  useUploadFileMutation: jest.fn((_opts: Record<string, unknown>) => ({
    mutate: mockMutate,
  })),
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
    resizeImageIfNeeded: jest.fn(async (file: File) => ({ file, resized: false })),
  })),
}));

jest.mock('../useUpdateFiles', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    addFile: jest.fn(),
    replaceFile: jest.fn(),
    updateFileById: jest.fn(),
    deleteFileById: jest.fn(),
  })),
}));

jest.mock('~/utils', () => ({
  logger: { log: jest.fn() },
  validateFiles: jest.fn(() => true),
  cachePreview: jest.fn(),
  getCachedPreview: jest.fn(() => undefined),
}));

const mockValidateFiles = jest.requireMock('~/utils').validateFiles;

describe('useFileHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessFileForUpload.mockImplementation(async (file: File) => file);
    mockConversation = {};
    mockIsTemporary = false;
  });

  const loadHook = async () => (await import('../useFileHandling')).default;

  describe('endpointOverride', () => {
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
});
