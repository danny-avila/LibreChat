import React from 'react';
import { getDefaultStore, useAtom } from 'jotai';
import { filesFamily } from '@librechat/chat/react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants, LocalStorageKeys, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import {
  setFilesDraft,
  getAskAnswerDraftId,
  bindComposerLaunch,
  captureComposerDraft,
  adoptComposerConversation,
} from '~/utils/drafts';
import { beginFileSearchUpload, transferFileSearchPreference } from '~/hooks/Files/search';
import { setFileSearchChoice, transferFileSearchChoice } from '~/utils/choices';
import { clearUploadRecovery } from '~/hooks/Files/useFileHandling';
import { useAutoSave } from '~/hooks/Input/useAutoSave';

const mockDeleteFiles = jest.fn();
const mockUploadFile = jest.fn();
let mockUploadOptions: { onSuccess?: (data: object, body: FormData) => void } = {};
let mockPreparationGate: Promise<void> | undefined;
let mockConfigPending = false;
let mockDownloadedFiles: File[] = [];
const mockResizeFile = jest.fn(async (file: File) => ({ file, resized: false }));
const mockConvertFile = jest.fn(
  async (file: File, _quality?: number, _onProgress?: (progress: number) => void) => file,
);

let mockSaveDrafts = false;
let mockPreviousConversation: { conversationId: string; endpoint: EModelEndpoint } | null = null;
let mockFileList: object[] = [];
const mockSetEphemeralAgent = jest.fn();
const mockRemoveTabAttachmentPresence = jest.fn();
const mockCollectForeignAttachmentClaims = jest.fn(
  (_excludeDraftIds: string[], _excludeOwnPane?: number | 'tab') => new Set(mockForeignClaims),
);
const mockForeignClaims = new Set<string>();
const mockMarkedPasteIds = new Set<string>();
const mockPendingDiscardIds = new Set<string>();
const mockStorePendingDiscardIds = jest.fn((_index: number, ids: string[]) => {
  mockPendingDiscardIds.clear();
  ids.forEach((id) => mockPendingDiscardIds.add(id));
});
const mockFiles = new Map<
  string,
  {
    file_id: string;
    temp_file_id?: string;
    filepath?: string;
    source?: string;
    embedded?: boolean;
    attached?: boolean;
    progress?: number;
  }
>();

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

jest.mock('~/Providers/ChatSettingsContext', () => ({
  useChatSettings: () => ({ saveDrafts: mockSaveDrafts }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: (key: string) => {
    if (key === 'saveBadgesState') {
      return true;
    }
    return null;
  },
  useSetRecoilState: (key: string) => (update: unknown) => mockSetEphemeralAgent(key, update),
  useRecoilCallback: (callback) =>
    callback.length === 0
      ? jest.fn()
      : callback({ set: (key, update) => mockSetEphemeralAgent(key, update) }),
}));
jest.mock('librechat-data-provider/react-query', () => ({
  useGetModelsQuery: () => ({ data: {} }),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils/drafts'),
  ...jest.requireActual('~/utils/files'),
  ...jest.requireActual('~/utils/previewCache'),
  updateLastSelectedModel: jest.fn(),
  getLocalStorageItems: () => ({}),
  getDefaultModelSpec: () => ({}),
  getDefaultEndpoint: () => undefined,
  getModelSpecPreset: jest.fn(),
  hasModelSelection: () => false,
  isPastedTextFileMarked: (fileId?: string | null) =>
    fileId != null && mockMarkedPasteIds.has(fileId),
  collectForeignAttachmentClaims: (excludeDraftIds: string[], excludeOwnPane?: number | 'tab') =>
    mockCollectForeignAttachmentClaims(excludeDraftIds, excludeOwnPane),
  getNewConversationDraftId: (index = 0) => (index === 0 ? 'new' : `new:${index}`),
  getPendingDraftId: (index = 0) => (index === 0 ? 'pending' : `pending:${index}`),
  renewNewConversationDraftToken: jest.fn(
    jest.requireActual('~/utils/drafts').renewNewConversationDraftToken,
  ),
  removeTabAttachmentPresence: (...args: unknown[]) => mockRemoveTabAttachmentPresence(...args),
  loadPendingDiscardIds: () => [...mockPendingDiscardIds],
  storePendingDiscardIds: (index: number, ids: string[]) => mockStorePendingDiscardIds(index, ids),
  scheduleRetainedFileDeletionRetry: jest.fn(),
  retainFileDeletion: jest.fn(),
  failedFileIdsFrom: () => [],
  logger: { log: jest.fn() },
}));

jest.mock('~/data-provider', () => ({
  useDeleteFilesMutation: () => ({ mutateAsync: mockDeleteFiles }),
  useGetEndpointsQuery: () => ({ data: {} }),
  useGetStartupConfig: () => ({ data: {} }),
  useGetFiles: () => ({ data: mockFileList }),
  useGetFileConfig: () => ({ data: null }),
  useGetAgentByIdQuery: () => ({ data: undefined }),
  useUploadFileMutation: (options) => {
    mockUploadOptions = options;
    return { mutate: mockUploadFile };
  },
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: jest.fn() }),
}));
jest.mock('~/Providers/AgentsMapContext', () => ({ useAgentsMapContext: () => ({}) }));
jest.mock('../Files/useDelayedUploadToast', () => ({
  useDelayedUploadToast: () => ({ startUploadTimer: jest.fn(), clearUploadTimer: jest.fn() }),
}));
jest.mock('../Files/useClientResize', () => ({
  __esModule: true,
  default: () => ({
    isConfigPending: mockConfigPending,
    waitForConfig: () => mockPreparationGate,
    resizeImageIfNeeded: mockResizeFile,
  }),
}));
jest.mock('~/utils/heicConverter', () => ({
  processFileForUpload: (...args: [File]) => mockConvertFile(...args),
}));
jest.mock('../Files/useSharePointDownload', () => ({
  __esModule: true,
  default: () => ({
    downloadSharePointFiles: async () => {
      await mockPreparationGate;
      return mockDownloadedFiles;
    },
    isDownloading: false,
    downloadProgress: null,
    error: null,
  }),
}));

jest.mock('../Conversations/useNavigateToConvo', () => ({
  __esModule: true,
  supersedeNavigation: jest.fn(),
}));
jest.mock('../Conversations/useGetConversation', () => ({
  __esModule: true,
  default: () => () => mockPreviousConversation,
}));
jest.mock('../Assistants/useAssistantListMap', () => ({
  __esModule: true,
  default: () => ({}),
}));
jest.mock('../Files/useFileHandling', () => {
  const actual = jest.requireActual('../Files/useFileHandling');
  return { __esModule: true, ...actual, clearUploadRecovery: jest.fn(actual.clearUploadRecovery) };
});
jest.mock('../Agents', () => ({ useApplyModelSpecEffects: () => jest.fn() }));
jest.mock('../Audio', () => ({ usePauseGlobalAudio: () => ({ pauseGlobalAudio: jest.fn() }) }));
jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => ({}),
  useChatFormContext: () => ({ setValue: jest.fn() }),
}));
jest.mock('~/hooks', () => ({ useHasAccess: () => true }));
jest.mock('~/store', () => ({
  __esModule: true,
  ephemeralAgentByConvoId: (id: string) => id,
  default: {
    defaultPreset: 'defaultPreset',
    saveBadgesState: 'saveBadgesState',
    useClearConvoState: () => jest.fn(),
    useSetConversationAtom: () => ({ setConversation: jest.fn() }),
  },
}));

import useNewConvo, { clearInheritedAgentWorkspace } from '../useNewConvo';

describe('clearInheritedAgentWorkspace', () => {
  const workspaceBinding = [{ environmentId: 'machine-a', workspaceId: 'project-a' }];

  it('clears a workspace inherited by a new chat when the agent changes', () => {
    expect(
      clearInheritedAgentWorkspace(
        {
          conversationId: Constants.NEW_CONVO,
          endpoint: EModelEndpoint.agents,
          agent_id: 'agent-b',
          codeWorkspaces: workspaceBinding,
        } as TConversation,
        { agent_id: 'agent-a' } as TConversation,
      ).codeWorkspaces,
    ).toBeUndefined();
  });

  it('preserves an existing conversation workspace binding', () => {
    expect(
      clearInheritedAgentWorkspace(
        {
          conversationId: 'conversation-1',
          endpoint: EModelEndpoint.agents,
          agent_id: 'agent-b',
          codeWorkspaces: workspaceBinding,
        } as TConversation,
        { agent_id: 'agent-a' } as TConversation,
      ).codeWorkspaces,
    ).toEqual(workspaceBinding);
  });

  it('preserves a new-chat workspace binding when the agent is unchanged', () => {
    expect(
      clearInheritedAgentWorkspace(
        {
          conversationId: Constants.NEW_CONVO,
          endpoint: EModelEndpoint.agents,
          agent_id: 'agent-a',
          codeWorkspaces: workspaceBinding,
        } as TConversation,
        { agent_id: 'agent-a' } as TConversation,
      ).codeWorkspaces,
    ).toEqual(workspaceBinding);
  });
});

describe('useNewConvo reset cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSaveDrafts = false;
    mockPreviousConversation = null;
    mockFileList = [];
    mockDeleteFiles.mockResolvedValue({});
    mockForeignClaims.clear();
    mockMarkedPasteIds.clear();
    mockPendingDiscardIds.clear();
    mockFiles.clear();
    mockFiles.set('claimed-file', {
      file_id: 'claimed-file',
      temp_file_id: 'client-claimed-file',
      filepath: '/uploads/claimed-file.txt',
      source: 'local',
    });
    mockFiles.set('own-file', {
      file_id: 'own-file',
      temp_file_id: 'client-own-file',
      filepath: '/uploads/own-file.txt',
      source: 'local',
    });
    /** The hook reads the real pane atom, so each pane a test renders starts on this map. */
    for (const index of [0, 2]) {
      getDefaultStore().set(filesFamily(index), mockFiles as Map<string, ExtendedFile>);
    }
  });

  it.each(['before-ack', 'after-ack', 'later-disable'])(
    'keeps the accepted upload preference when completion is %s',
    (order) => {
      const sourceKey = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}new`;
      const targetKey = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}assigned-preference`;
      setFileSearchChoice('new', false);
      localStorage.setItem(sourceKey, order === 'before-ack' ? 'true' : 'false');
      transferFileSearchPreference('new', 'assigned-preference');
      if (order === 'after-ack') localStorage.setItem(targetKey, 'true');
      if (order === 'later-disable') setFileSearchChoice('assigned-preference', false);
      expect(transferFileSearchPreference('new', 'assigned-preference')).toBe(
        order !== 'later-disable',
      );
      expect(localStorage.getItem(targetKey)).toBe(JSON.stringify(order !== 'later-disable'));
    },
  );

  it.each(
    ['remove', 'replace'].flatMap((change) =>
      [undefined, 'file_search'].map((resource) => ({ change, resource })),
    ),
  )('accepts a fresh $resource upload after project $change', async ({ change, resource }) => {
    const { useFileHandlingNoChatContext } = await import('../Files/useFileHandling');
    mockSaveDrafts = false;
    mockFiles.clear();
    mockConfigPending = false;
    mockPreparationGate = undefined;
    window.history.replaceState({}, '', '/c/new?projectId=project-a');
    global.URL.createObjectURL = jest.fn(() => 'blob:project-change');
    global.URL.revokeObjectURL = jest.fn();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, cacheTime: Infinity },
        mutations: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    const { result, rerender, unmount } = renderHook(
      ({ projectId }: { projectId: string | null }) => {
        const [files, setFiles] = useAtom(filesFamily(2));
        useAutoSave({ index: 2, conversationId: 'new', files, setFiles });
        return {
          files,
          handler: useFileHandlingNoChatContext(undefined, {
            index: 2,
            files,
            setFiles,
            conversation: {
              conversationId: 'new',
              endpoint: EModelEndpoint.openAI,
              chatProjectId: projectId,
            } as TConversation,
          }),
        };
      },
      { wrapper, initialProps: { projectId: 'project-a' as string | null } },
    );
    const previousOwner = captureComposerDraft(2, 'new');
    const previousLaunch = { conversationId: 'new' };
    bindComposerLaunch(previousLaunch, 2);
    act(() => {
      const projectId = change === 'replace' ? 'project-b' : null;
      window.history.replaceState({}, '', projectId ? `/c/new?projectId=${projectId}` : '/c/new');
      rerender({ projectId });
    });
    expect(previousOwner()).toBe(false);
    const currentOwner = captureComposerDraft(2, 'new');
    expect(currentOwner()).toBe(true);
    await act(async () => {
      expect(
        await result.current.handler.handleFiles(
          [new File(['project'], 'project.txt', { type: 'text/plain' })],
          resource,
        ),
      ).toBe(true);
    });
    const body = mockUploadFile.mock.calls[0][0] as FormData;
    expect(body.get('tool_resource')).toBe(resource ?? null);
    await act(async () => {
      mockUploadOptions.onSuccess?.(
        {
          file_id: 'persisted-project-upload',
          temp_file_id: body.get('file_id'),
          filename: 'project.txt',
          filepath: '/files/project.txt',
          type: 'text/plain',
          embedded: resource === 'file_search',
        },
        body,
      );
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    expect(result.current.files.get(body.get('file_id') as string)?.progress).toBe(1);
    expect(mockSetEphemeralAgent.mock.calls.length > 0).toBe(resource === 'file_search');
    expect(adoptComposerConversation(previousLaunch, 'stale-project', 2)).toBe(false);
    const launch = { conversationId: 'new' };
    bindComposerLaunch(launch, 2);
    expect(adoptComposerConversation(launch, 'fresh-project', 2)).toBe(true);
    unmount();
    client.clear();
    window.history.replaceState({}, '', '/');
  });

  it.each([false, true])(
    'completes the next first-ID upload after a same-route reset (saveDrafts: %s)',
    async (saveDrafts) => {
      const { useFileHandlingNoChatContext } = await import('../Files/useFileHandling');
      mockSaveDrafts = saveDrafts;
      mockFiles.clear();
      mockPreviousConversation = {
        conversationId: 'new',
        endpoint: EModelEndpoint.openAI,
      };
      window.history.replaceState({}, '', '/c/new');
      global.URL.createObjectURL = jest.fn(() => 'blob:reset-generation');
      global.URL.revokeObjectURL = jest.fn();
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, cacheTime: Infinity },
          mutations: { retry: false },
        },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
      const { result, rerender, unmount } = renderHook(
        ({ conversationId, isSubmitting }) => {
          const [files, setFiles] = useAtom(filesFamily(2));
          useAutoSave({ index: 2, conversationId, isSubmitting, files, setFiles });
          return {
            files,
            handler: useFileHandlingNoChatContext(undefined, {
              index: 2,
              files,
              setFiles,
              conversation: { conversationId, endpoint: EModelEndpoint.openAI } as TConversation,
            }),
          };
        },
        { wrapper, initialProps: { conversationId: 'new', isSubmitting: false } },
      );
      const oldLaunch = { conversationId: 'new' };
      bindComposerLaunch(oldLaunch, 2);
      const next = renderHook(() => useNewConvo(2), { wrapper });
      const launch = { conversationId: 'new' };
      act(() => {
        next.result.current.newConversation();
        bindComposerLaunch(launch, 2);
      });
      expect(adoptComposerConversation(oldLaunch, 'stale-generation', 2)).toBe(false);
      act(() => rerender({ conversationId: 'new', isSubmitting: true }));
      await act(async () => {
        expect(
          await result.current.handler.handleFiles(
            [new File(['search'], 'reset.txt', { type: 'text/plain' })],
            'file_search',
          ),
        ).toBe(true);
      });
      const body = mockUploadFile.mock.calls[0][0] as FormData;
      const options = mockUploadOptions;
      expect(adoptComposerConversation(launch, 'saved-after-reset', 2)).toBe(true);
      act(() => rerender({ conversationId: 'saved-after-reset', isSubmitting: false }));
      mockSetEphemeralAgent.mockClear();
      await act(async () => {
        const persisted = {
          temp_file_id: body.get('file_id'),
          file_id: 'persisted-after-reset',
          filename: 'reset.txt',
          filepath: '/files/reset.txt',
          type: 'text/plain',
          bytes: 6,
          embedded: true,
        };
        mockFileList = [persisted];
        options.onSuccess?.(persisted, body);
        rerender({ conversationId: 'saved-after-reset', isSubmitting: false });
        await new Promise((resolve) => setTimeout(resolve, 320));
      });
      expect(result.current.files.get(body.get('file_id') as string)?.progress).toBe(1);
      expect(mockSetEphemeralAgent).toHaveBeenCalledWith('saved-after-reset', expect.any(Function));
      expect(localStorage.getItem(`${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}new`)).not.toBe(
        'true',
      );
      expect(
        localStorage.getItem(`${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}saved-after-reset`),
      ).toBe('true');
      next.unmount();
      unmount();
      queryClient.clear();
      window.history.replaceState({}, '', '/');
    },
  );

  it.each(['upload', 'composer'])(
    'keeps acknowledged first-ID completion when the %s host remounts',
    async (remount) => {
      const { useFileHandlingNoChatContext } = await import('../Files/useFileHandling');
      mockSaveDrafts = false;
      mockFiles.clear();
      mockConfigPending = false;
      global.URL.createObjectURL = jest.fn(() => 'blob:remount');
      global.URL.revokeObjectURL = jest.fn();
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, cacheTime: Infinity },
          mutations: { retry: false },
        },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
      const useDraft = ({ conversationId }: { conversationId: string }) => {
        const [files, setFiles] = useAtom(filesFamily(2));
        useAutoSave({ index: 2, conversationId, files, setFiles });
        return { files, setFiles };
      };
      let draft = renderHook(useDraft, { wrapper, initialProps: { conversationId: 'new' } });
      const upload = renderHook(
        () =>
          useFileHandlingNoChatContext(undefined, {
            index: 2,
            ...draft.result.current,
            conversation: {
              conversationId: 'new',
              endpoint: EModelEndpoint.openAI,
            } as TConversation,
          }),
        { wrapper },
      );
      const launch = { conversationId: 'new' };
      bindComposerLaunch(launch, 2);
      await act(async () => {
        await upload.result.current.handleFiles(
          [new File(['file'], 'remount.txt', { type: 'text/plain' })],
          'file_search',
        );
      });
      const body = mockUploadFile.mock.calls[0][0] as FormData;
      const options = mockUploadOptions;
      expect(adoptComposerConversation(launch, 'saved-remount', 2)).toBe(true);
      act(() => draft.rerender({ conversationId: 'saved-remount' }));
      upload.unmount();
      if (remount === 'composer') {
        draft.unmount();
        draft = renderHook(useDraft, {
          wrapper,
          initialProps: { conversationId: 'saved-remount' },
        });
      }
      const replacement = renderHook(
        () =>
          useFileHandlingNoChatContext(undefined, {
            index: 2,
            ...draft.result.current,
            conversation: {
              conversationId: 'saved-remount',
              endpoint: EModelEndpoint.openAI,
            } as TConversation,
          }),
        { wrapper },
      );
      await act(async () => {
        options.onSuccess?.(
          {
            temp_file_id: body.get('file_id'),
            file_id: 'persisted-remount',
            filename: 'remount.txt',
            filepath: '/files/remount',
            type: 'text/plain',
            embedded: true,
          },
          body,
        );
        await new Promise((resolve) => setTimeout(resolve, 320));
      });
      expect(draft.result.current.files.get(body.get('file_id') as string)?.progress).toBe(1);
      replacement.unmount();
      draft.unmount();
      queryClient.clear();
    },
  );

  it.each([
    'pending-no-drafts',
    'assigned',
    'assigned-disable',
    'source-disable',
    'unrelated-navigation',
  ])('keeps logical upload ownership through %s', async (mode) => {
    const { useFileHandlingNoChatContext } = await import('../Files/useFileHandling');
    mockConfigPending = false;
    mockPreparationGate = undefined;
    mockFiles.clear();
    mockSaveDrafts = mode !== 'pending-no-drafts';
    const sourceId = mode === 'pending-no-drafts' ? 'existing-chat' : 'new';
    const sourceConversation = { conversationId: sourceId };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, cacheTime: Infinity },
        mutations: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    global.URL.createObjectURL = jest.fn(() => 'blob:logical');
    global.URL.revokeObjectURL = jest.fn();
    const { result, rerender, unmount } = renderHook(
      ({ conversationId, isSubmitting }) => {
        const [files, setFiles] = useAtom(filesFamily(2));
        useAutoSave({ index: 2, conversationId, isSubmitting, files, setFiles });
        return {
          files,
          handler: useFileHandlingNoChatContext(undefined, {
            index: 2,
            files,
            setFiles,
            conversation: { conversationId, endpoint: EModelEndpoint.openAI } as TConversation,
          }),
        };
      },
      { wrapper, initialProps: { conversationId: sourceId, isSubmitting: true } },
    );
    if (mode !== 'pending-no-drafts') bindComposerLaunch(sourceConversation, 2);
    await act(async () => {
      expect(
        await result.current.handler.handleFiles(
          [new File(['text'], 'logical.txt', { type: 'text/plain' })],
          'file_search',
        ),
      ).toBe(true);
    });
    const body = mockUploadFile.mock.calls[0][0] as FormData;
    const options = mockUploadOptions;
    const targetId = mode === 'pending-no-drafts' ? sourceId : 'saved-chat';
    if (mode !== 'pending-no-drafts' && mode !== 'unrelated-navigation') {
      expect(adoptComposerConversation(sourceConversation, targetId, 2)).toBe(true);
      transferFileSearchChoice('new', targetId);
    }
    act(() => rerender({ conversationId: targetId, isSubmitting: false }));
    if (mode === 'assigned-disable') setFileSearchChoice(targetId, false);
    if (mode === 'source-disable') setFileSearchChoice('new', false);
    mockSetEphemeralAgent.mockClear();
    await act(async () => {
      const persisted = {
        temp_file_id: body.get('file_id'),
        file_id: 'server-file',
        filepath: '/files/logical',
        filename: 'logical.txt',
        type: 'text/plain',
        bytes: 4,
        embedded: true,
      };
      mockFileList = [persisted];
      options.onSuccess?.(persisted, body);
      rerender({ conversationId: targetId, isSubmitting: false });
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    if (mode === 'pending-no-drafts' || mode === 'assigned') {
      expect(result.current.files.get(body.get('file_id') as string)?.progress).toBe(1);
      expect(mockSetEphemeralAgent).toHaveBeenCalledWith(targetId, expect.any(Function));
      expect(localStorage.getItem(`${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${targetId}`)).toBe(
        'true',
      );
    } else if (mode !== 'unrelated-navigation')
      expect(mockSetEphemeralAgent).not.toHaveBeenCalled();
    if (mode !== 'pending-no-drafts' && mode !== 'unrelated-navigation')
      expect(localStorage.getItem(`${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}new`)).not.toBe(
        'true',
      );
    unmount();
    queryClient.clear();
  });

  it.each(
    [
      'config',
      'queue',
      'sharepoint',
      'sharepoint-no-context',
      'heic',
      'decode',
      'route',
      'answer',
      'unmount',
    ].flatMap((boundary) => ['new', 'origin'].map((origin) => ({ boundary, origin }))),
  )(
    'abandons $boundary upload after $origin composer resets before staging',
    async ({ boundary, origin }) => {
      const { useFileHandlingNoChatContext } = await import('../Files/useFileHandling');
      const { default: useSharePoint, useSharePointFileHandlingNoChatContext } = await import(
        '../Files/useSharePointFileHandling'
      );
      const { ChatContext } = await import('~/Providers/ChatContext');
      let release: () => void = () => undefined;
      mockPreparationGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      mockConfigPending = ['config', 'queue', 'route', 'answer', 'unmount'].includes(boundary);
      mockSaveDrafts = true;
      mockPreviousConversation = { conversationId: origin, endpoint: EModelEndpoint.openAI };
      mockFiles.clear();
      global.URL.createObjectURL = jest.fn(() => 'blob:deferred');
      global.URL.revokeObjectURL = jest.fn();
      mockDownloadedFiles = [new File(['search'], 'search.txt', { type: 'text/plain' })];
      mockConvertFile.mockImplementation(async (file, _quality, onProgress) => {
        await mockPreparationGate;
        onProgress?.(0.8);
        return file;
      });
      const imageCallbacks: (() => void)[] = [];
      const originalImage = global.Image;
      if (boundary === 'decode') {
        Object.defineProperty(global, 'Image', {
          configurable: true,
          writable: true,
          value: class {
            width = 640;
            height = 480;
            onload: (() => void) | null = null;
            set src(_value: string) {
              imageCallbacks.push(() => this.onload?.());
            }
          },
        });
      }
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, cacheTime: Infinity },
          mutations: { retry: false },
        },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
      const { result, rerender, unmount } = renderHook(
        ({ conversationId, draftId }) => {
          const [files, setFiles] = useAtom(filesFamily(2));
          const state = {
            index: 2,
            files,
            setFiles,
            conversation: { conversationId, endpoint: EModelEndpoint.openAI } as TConversation,
          };
          useAutoSave({ ...state, index: 2, conversationId, draftId });
          const handler = useFileHandlingNoChatContext(undefined, state);
          const sharepoint = useSharePointFileHandlingNoChatContext(
            { toolResource: 'file_search' },
            state,
          );
          return { handler, sharepoint, files, state };
        },
        { wrapper, initialProps: { conversationId: origin, draftId: null as string | null } },
      );
      const contextState = result.current.state;
      const contextSharePoint = renderHook(() => useSharePoint({ toolResource: 'file_search' }), {
        wrapper: ({ children }) =>
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(
              ChatContext.Provider,
              {
                value: contextState as ReturnType<
                  typeof import('~/Providers/ChatContext').useChatContext
                >,
              },
              children,
            ),
          ),
      });
      const next = renderHook(() => useNewConvo(2), { wrapper });
      let first: Promise<boolean> | undefined;
      let pending: Promise<boolean | void> = Promise.resolve();
      act(() => {
        if (boundary === 'queue')
          first = result.current.handler.handleFiles(mockDownloadedFiles, 'file_search');
        if (boundary === 'sharepoint') {
          pending = contextSharePoint.result.current.handleSharePointFiles([]);
        } else if (boundary === 'sharepoint-no-context') {
          pending = result.current.sharepoint.handleSharePointFiles([]);
        } else {
          let selectedFiles = mockDownloadedFiles;
          if (boundary === 'heic')
            selectedFiles = [new File(['heic'], 'search.heic', { type: 'image/heic' })];
          else if (boundary === 'decode')
            selectedFiles = [new File(['image'], 'search.png', { type: 'image/png' })];
          pending = result.current.handler.handleFiles(selectedFiles, 'file_search');
        }
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      act(() => {
        if (boundary === 'unmount') unmount();
        else if (boundary === 'route') {
          window.history.pushState({}, '', '/c/destination');
          rerender({ conversationId: 'destination', draftId: null });
        } else if (boundary === 'answer') {
          rerender({ conversationId: origin, draftId: getAskAnswerDraftId('next-question') });
        } else {
          next.result.current.newConversation();
          rerender({ conversationId: 'new', draftId: null });
        }
      });
      await act(async () => {
        release();
        await first;
        const accepted = await pending;
        if (!boundary.startsWith('sharepoint') && boundary !== 'decode')
          expect(accepted).toBe(false);
        imageCallbacks.forEach((decode) => decode());
      });
      expect(mockUploadFile).not.toHaveBeenCalled();
      if (boundary !== 'unmount') expect(result.current.files.size).toBe(0);
      expect(mockSetEphemeralAgent).not.toHaveBeenCalled();
      contextSharePoint.unmount();
      next.unmount();
      unmount();
      mockConfigPending = false;
      mockPreparationGate = undefined;
      window.history.replaceState({}, '', '/');
      global.Image = originalImage;
      queryClient.clear();
    },
  );

  it.each(['retained', 'discarded', 'disabled', 'unrelated', 'other-conversation'])(
    'restores File Search only for a retained explicit upload (%s)',
    (mode) => {
      mockSaveDrafts = mode !== 'discarded';
      mockPreviousConversation = {
        conversationId: 'origin-conversation',
        endpoint: EModelEndpoint.openAI,
      };
      mockFiles.clear();
      mockFiles.set('pending-search', {
        file_id: 'pending-search',
        attached: false,
        progress: 0.2,
      });
      setFilesDraft('origin-conversation', { fileIds: ['pending-search'], pendingPastes: {} });
      if (mode !== 'unrelated') {
        beginFileSearchUpload(
          'pending-search',
          mode === 'other-conversation' ? 'other-conversation' : 'origin-conversation',
        );
        if (mode === 'disabled') {
          setFileSearchChoice('origin-conversation', false);
        }
      }
      const next = renderHook(() => useNewConvo());
      act(() => next.result.current.newConversation());
      expect(clearUploadRecovery).toHaveBeenCalledWith('pending-search', mockSaveDrafts);
      expect(getDefaultStore().get(filesFamily(0)).size).toBe(0);
      next.unmount();

      // Persistence finishes after leaving; restoration reads the real saved draft and file cache.
      mockSaveDrafts = true;
      mockFileList = [
        {
          file_id: 'persisted-search',
          temp_file_id: 'pending-search',
          filepath: '/files/search.txt',
          filename: 'search.txt',
          bytes: 5,
          type: 'text/plain',
          embedded: true,
          llmDeliveryPath: 'none',
        },
      ];
      const setFiles = jest.fn();
      const restored = renderHook(() =>
        useAutoSave({
          conversationId: 'origin-conversation',
          files: new Map(),
          setFiles,
        }),
      );
      const files = setFiles.mock.calls.reduce(
        (current, [update]) => (typeof update === 'function' ? update(current) : update),
        new Map(),
      );
      expect(files.get('pending-search')).toMatchObject({
        file_id: 'persisted-search',
        progress: 1,
        llmDeliveryPath: 'none',
      });
      if (mode === 'retained') {
        expect(mockSetEphemeralAgent).toHaveBeenCalledWith(
          'origin-conversation',
          expect.any(Function),
        );
        const update = mockSetEphemeralAgent.mock.calls.at(-1)?.[1];
        expect(update({ web_search: true })).toEqual({ web_search: true, file_search: true });
        expect(
          localStorage.getItem(`${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}origin-conversation`),
        ).toBe('true');
      } else {
        expect(mockSetEphemeralAgent).not.toHaveBeenCalled();
      }
      restored.unmount();
    },
  );

  it.each(['active', 'other-question', 'other-conversation', 'other-pane'])(
    'retains only the owning active answer draft on New Chat (%s)',
    (mode) => {
      mockSaveDrafts = true;
      mockPreviousConversation = {
        conversationId: 'answer-origin',
        endpoint: EModelEndpoint.openAI,
      };
      mockFiles.clear();
      mockFiles.set('answer-upload', { file_id: 'answer-upload', attached: false, progress: 0.2 });
      const draftId = getAskAnswerDraftId('active-question');
      const source = renderHook(() =>
        useAutoSave({
          index: mode === 'other-pane' ? 0 : 2,
          conversationId: mode === 'other-conversation' ? 'unrelated-origin' : 'answer-origin',
          draftId,
          files: mockFiles as Map<string, ExtendedFile>,
          setFiles: jest.fn(),
        }),
      );
      if (mode === 'other-question') {
        setFilesDraft(draftId, { fileIds: [], pendingPastes: {} });
        setFilesDraft(getAskAnswerDraftId('other-question'), {
          fileIds: ['answer-upload'],
          pendingPastes: {},
        });
      }
      beginFileSearchUpload('answer-upload', 'answer-origin');
      const next = renderHook(() => useNewConvo(2));
      act(() => next.result.current.newConversation());
      expect(clearUploadRecovery).toHaveBeenCalledWith('answer-upload', mode === 'active');
      next.unmount();
      source.unmount();
      mockFileList = [
        { file_id: 'saved-answer', temp_file_id: 'answer-upload', bytes: 3, embedded: true },
      ];
      setFilesDraft(draftId, { fileIds: ['answer-upload'], pendingPastes: {} });
      mockSetEphemeralAgent.mockClear();
      const restored = renderHook(() =>
        useAutoSave({
          index: 2,
          conversationId: 'answer-origin',
          draftId,
          files: new Map(),
          setFiles: jest.fn(),
        }),
      );
      expect(mockSetEphemeralAgent.mock.calls.length > 0).toBe(mode === 'active');
      restored.unmount();
    },
  );

  it('does not delete a file claimed by another tab but deletes an unclaimed file', () => {
    mockForeignClaims.add('claimed-file');
    const { result } = renderHook(() => useNewConvo(2));

    act(() => {
      result.current.newConversation();
    });

    expect(mockCollectForeignAttachmentClaims).toHaveBeenCalledWith(['new:2', 'pending:2'], 2);
    expect(mockRemoveTabAttachmentPresence).toHaveBeenCalledWith(expect.any(Array), 2);

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        {
          file_id: 'own-file',
          embedded: false,
          filepath: '/uploads/own-file.txt',
          source: 'local',
        },
      ],
    });
  });

  it('defers an in-flight generated paste when drafts are disabled', () => {
    /** Direct `newConversation()` callers never pass through useNewChat, so this reset is the only
     * thing that can remember an upload with no filepath yet: nothing else would be left to delete
     * the server record once the request finally lands. */
    mockFiles.clear();
    mockFiles.set('inflight-paste', {
      file_id: 'inflight-paste',
      attached: false,
      progress: 0,
    });
    mockMarkedPasteIds.add('inflight-paste');
    const { result } = renderHook(() => useNewConvo());

    act(() => {
      result.current.newConversation();
    });

    expect(mockStorePendingDiscardIds).toHaveBeenCalledWith(0, ['inflight-paste']);
    expect(mockPendingDiscardIds).toEqual(new Set(['inflight-paste']));
  });
});
