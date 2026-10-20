import { getDefaultStore } from 'jotai';
import { filesFamily } from '@librechat/chat/react';
import { renderHook, act } from '@testing-library/react';
import { Constants, LocalStorageKeys, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { clearUploadRecovery } from '~/hooks/Files/useFileHandling';
import { beginFileSearchUpload } from '~/hooks/Files/search';
import { useAutoSave } from '~/hooks/Input/useAutoSave';
import { setTimestamp } from '~/utils/timestamps';
import { setFilesDraft } from '~/utils/drafts';

const mockDeleteFiles = jest.fn();
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
  useRecoilCallback: () => jest.fn(),
}));
jest.mock('librechat-data-provider/react-query', () => ({
  useGetModelsQuery: () => ({ data: {} }),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils/drafts'),
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
  renewNewConversationDraftToken: jest.fn(),
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
  return { ...actual, clearUploadRecovery: jest.fn(actual.clearUploadRecovery) };
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
        const now = Date.now();
        const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
        beginFileSearchUpload(
          'pending-search',
          mode === 'other-conversation' ? 'other-conversation' : 'origin-conversation',
        );
        if (mode === 'disabled') {
          clock.mockReturnValue(now + 1);
          const preference = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}origin-conversation`;
          localStorage.setItem(preference, 'false');
          setTimestamp(preference);
        }
        clock.mockRestore();
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
