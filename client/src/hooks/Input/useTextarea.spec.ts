import React from 'react';
import { useRecoilState } from 'recoil';
import { renderHook } from '@testing-library/react';
import { useChatFormContext } from '~/Providers';
import useTextarea from './useTextarea';

const mockSetActivePrompt = jest.fn();
const mockSetValue = jest.fn();
const mockInsertTextAtCursor = jest.fn();

jest.mock('recoil', () => ({
  useRecoilValue: jest.fn(() => true),
  useRecoilState: jest.fn(() => ['selected prompt', mockSetActivePrompt]),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('librechat-data-provider', () => ({
  EToolResources: { context: 'context' },
  isAssistantsEndpoint: jest.fn(() => false),
}));

jest.mock('~/utils', () => ({
  forceResize: jest.fn(),
  insertTextAtCursor: (...args: [HTMLTextAreaElement, string]) => mockInsertTextAtCursor(...args),
  getEntityName: jest.fn(() => ''),
  getEntity: jest.fn(() => ({ entity: null, isAgent: false, isAssistant: false })),
  checkIfScrollable: jest.fn(() => false),
}));

jest.mock('~/utils/shortcuts', () => ({
  resolveComposerKeyDown: jest.fn(() => 'none'),
}));

jest.mock('~/Providers', () => ({
  useChatFormContext: jest.fn(() => ({ setValue: mockSetValue })),
  useUploadModalContext: jest.fn(() => ({ openModal: jest.fn() })),
}));

jest.mock('~/Providers/AssistantsMapContext', () => ({
  useAssistantsMapContext: jest.fn(() => ({})),
}));

jest.mock('~/Providers/AgentsMapContext', () => ({
  useAgentsMapContext: jest.fn(() => ({})),
}));

jest.mock('~/Providers/ChatContext', () => ({
  useChatContext: jest.fn(() => ({
    index: 0,
    conversation: { endpoint: 'openAI' },
    isSubmitting: false,
    setFilesLoading: jest.fn(),
  })),
}));

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessageMeta: jest.fn(() => null),
}));

jest.mock('~/hooks/Input/useComposerBindings', () =>
  jest.fn(() => ({ submitOverride: null, yieldedChords: [] })),
);

jest.mock('~/hooks/Files/useFileUploadRouter', () => jest.fn(() => jest.fn()));
jest.mock('~/hooks/Files/useUploadOptions', () =>
  jest.fn(() => ({ getOptions: jest.fn(() => []), uploadsDisabled: false })),
);
jest.mock('~/hooks/Conversations/useGetSender', () => jest.fn(() => jest.fn(() => '')));

jest.mock('~/data-provider', () => ({
  useInteractionHealthCheck: jest.fn(() => jest.fn()),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(() => (key: string) => key),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    enterToSend: 'enterToSend',
    activePromptByIndex: jest.fn(() => 'activePromptByIndex'),
  },
}));

const mockUseRecoilState = useRecoilState as jest.Mock;
const mockUseChatFormContext = useChatFormContext as jest.Mock;

describe('useTextarea prompt insertion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRecoilState.mockReturnValue(['selected prompt', mockSetActivePrompt]);
    mockUseChatFormContext.mockReturnValue({ setValue: mockSetValue });
  });

  it('inserts a prompt into form state without requiring DOM focus', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'draft text';
    textarea.setSelectionRange(6, 10);
    mockSetValue.mockImplementation((_name, value) => {
      textarea.value = value;
    });
    const textAreaRef = { current: textarea } as React.RefObject<HTMLTextAreaElement>;

    renderHook(() =>
      useTextarea({
        textAreaRef,
        submitButtonRef: { current: null },
        setIsScrollable: jest.fn(),
      }),
    );

    expect(mockInsertTextAtCursor).not.toHaveBeenCalled();
    expect(mockSetValue).toHaveBeenCalledWith('text', 'draft selected prompt', {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(textarea.selectionStart).toBe(21);
    expect(textarea.selectionEnd).toBe(21);
    expect(mockSetActivePrompt).toHaveBeenCalledWith(undefined);
  });
});
