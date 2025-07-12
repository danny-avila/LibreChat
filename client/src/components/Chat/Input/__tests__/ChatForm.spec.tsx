import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoilRoot } from 'recoil';
import type { RecoilState } from 'recoil';
import type { UseFormReturn } from 'react-hook-form';
import type { ChatFormValues } from '~/common';
import type { TConversation, TMessage, EModelEndpoint } from 'librechat-data-provider';

const mockUseChatFormContext = jest.fn();
const mockUseChatContext = jest.fn();
const mockUseAddedChatContext = jest.fn();
const mockUseAssistantsMapContext = jest.fn();

jest.mock('react-hook-form', () => ({
  ...jest.requireActual('react-hook-form'),
  useWatch: jest.fn(() => ''),
}));

jest.mock('~/Providers', () => ({
  useChatFormContext: jest.fn(),
  useChatContext: jest.fn(),
  useAddedChatContext: jest.fn(),
  useAssistantsMapContext: jest.fn(),
  ChatContext: {
    Provider: ({ children }: any) => children,
    Consumer: ({ children }: any) => children({}),
  },
  AddedChatContext: {
    Provider: ({ children }: any) => children,
    Consumer: ({ children }: any) => children({}),
  },
  AssistantsMapContext: {
    Provider: ({ children }: any) => children,
    Consumer: ({ children }: any) => children({}),
  },
  ChatFormProvider: ({ children }: any) => children,
}));

jest.mock('~/hooks', () => ({
  useTextarea: jest.fn(() => ({
    isNotAppendable: false,
    handlePaste: jest.fn(),
    handleKeyDown: jest.fn(),
    handleCompositionStart: jest.fn(),
    handleCompositionEnd: jest.fn(),
  })),
  useAutoSave: jest.fn(),
  useRequiresKey: jest.fn(() => ({ requiresKey: false })),
  useHandleKeyUp: jest.fn(() => jest.fn()),
  useQueryParams: jest.fn(),
  useSubmitMessage: jest.fn(() => ({
    submitMessage: jest.fn(),
    submitPrompt: jest.fn(),
  })),
  useFocusChatEffect: jest.fn(),
}));

jest.mock('../Files/AttachFileChat', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="attach-file-chat" />),
}));

jest.mock('../Files/FileFormChat', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="file-form-chat" />),
}));

jest.mock('../TextareaHeader', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="textarea-header" />),
}));

jest.mock('../PromptsCommand', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="prompts-command" />),
}));

jest.mock('../AudioRecorder', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="audio-recorder" />),
}));

jest.mock('../CollapseChat', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="collapse-chat" />),
}));

jest.mock('../StreamAudio', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="stream-audio" />),
}));

jest.mock('../StopButton', () => ({
  __esModule: true,
  default: jest.fn(({ stop, setShowStopButton }) => (
    <button
      data-testid="stop-button"
      onClick={() => {
        stop();
        setShowStopButton(false);
      }}
    />
  )),
}));

jest.mock('../SendButton', () => ({
  __esModule: true,
  default: jest.fn(({ disabled }: { disabled?: boolean }) => (
    <button data-testid="send-button" type="submit" disabled={disabled} />
  )),
}));

jest.mock('../EditBadges', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="edit-badges" />),
}));

jest.mock('../BadgeRow', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="badge-row" />),
}));

jest.mock('../Mention', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="mention" />),
}));

import ChatForm from '../ChatForm';
import {
  ChatContext,
  ChatFormProvider,
  AddedChatContext,
  AssistantsMapContext,
  useChatFormContext,
  useChatContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import * as hooks from '~/hooks';
import store from '~/store';

(useChatFormContext as jest.Mock).mockImplementation(() => mockUseChatFormContext());
(useChatContext as jest.Mock).mockImplementation(() => mockUseChatContext());
(useAddedChatContext as jest.Mock).mockImplementation(() => mockUseAddedChatContext());
(useAssistantsMapContext as jest.Mock).mockImplementation(() => mockUseAssistantsMapContext());

const createMockChatContext = (
  overrides: Partial<ReturnType<typeof import('~/hooks/Chat/useChatHelpers').default>> = {},
): ReturnType<typeof import('~/hooks/Chat/useChatHelpers').default> => ({
  files: new Map(),
  setFiles: jest.fn(),
  setFilesLoading: jest.fn(),
  filesLoading: false,
  conversation: {
    conversationId: 'test-id',
    endpoint: 'openAI' as EModelEndpoint,
    endpointType: 'openAI' as EModelEndpoint,
    messages: [],
    title: 'Test Conversation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as TConversation,
  isSubmitting: false,
  newConversation: jest.fn(),
  handleStopGenerating: jest.fn(),
  setConversation: jest.fn(),
  setIsSubmitting: jest.fn(),
  getMessages: jest.fn(() => []),
  setMessages: jest.fn(),
  setSiblingIdx: jest.fn(),
  latestMessage: null as TMessage | null,
  setLatestMessage: jest.fn(),
  resetLatestMessage: jest.fn(),
  ask: jest.fn(),
  index: 0,
  regenerate: jest.fn(),
  stopGenerating: jest.fn(),
  handleRegenerate: jest.fn(),
  handleContinue: jest.fn(),
  showPopover: false,
  setShowPopover: jest.fn(),
  abortScroll: false,
  setAbortScroll: jest.fn(),
  preset: null,
  setPreset: jest.fn(),
  optionSettings: {},
  setOptionSettings: jest.fn(),
  showAgentSettings: false,
  setShowAgentSettings: jest.fn(),
  ...overrides,
});

const createMockChatFormMethods = (): UseFormReturn<ChatFormValues> => {
  const mockFormState = {
    isDirty: false,
    isLoading: false,
    isSubmitted: false,
    isSubmitSuccessful: false,
    isSubmitting: false,
    isValidating: false,
    isValid: true,
    submitCount: 0,
    defaultValues: {},
    dirtyFields: {},
    touchedFields: {},
    validatingFields: {},
    errors: {},
  };

  const mockControl = {
    _subjects: {
      values: {
        next: jest.fn(),
        subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
      },
      array: {
        next: jest.fn(),
        subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
      },
      state: {
        next: jest.fn(),
        subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
      },
    },
    _getWatch: jest.fn(),
    _formValues: { text: '' },
    _defaultValues: { text: '' },
  } as any;

  return {
    register: jest.fn((name: keyof ChatFormValues) => ({
      ref: jest.fn(),
      onChange: jest.fn(),
      onBlur: jest.fn(),
      name,
    })) as UseFormReturn<ChatFormValues>['register'],
    handleSubmit: jest.fn(
      (fn: (data: ChatFormValues) => void | Promise<void>) =>
        async (e?: React.BaseSyntheticEvent) => {
          e?.preventDefault();
          await fn({ text: '' });
        },
    ) as UseFormReturn<ChatFormValues>['handleSubmit'],
    control: mockControl,
    setValue: jest.fn(),
    getValues: jest.fn(() => ({ text: '' })),
    watch: jest.fn(() => ''),
    reset: jest.fn(),
    resetField: jest.fn(),
    setError: jest.fn(),
    clearErrors: jest.fn(),
    setFocus: jest.fn(),
    trigger: jest.fn(),
    formState: mockFormState,
    unregister: jest.fn(),
  } as any;
};

const createMockAddedChatContext = (): ReturnType<
  typeof import('~/hooks/Chat/useAddedResponse').default
> => ({
  addedIndex: 1,
  generateConversation: jest.fn(),
  conversation: null,
  setConversation: jest.fn(),
  isSubmitting: false,
  ask: jest.fn(),
  regenerate: jest.fn(),
  getMessages: jest.fn(() => []),
  setMessages: jest.fn(),
  setIsSubmitting: jest.fn(),
});

interface RenderOptions {
  recoilState?: Array<[RecoilState<any>, any]>;
  chatContext?: Partial<ReturnType<typeof import('~/hooks/Chat/useChatHelpers').default>>;
}

const renderWithProviders = (
  ui: React.ReactElement,
  { recoilState = [], ...options }: RenderOptions = {},
) => {
  const chatContext = createMockChatContext(options.chatContext);
  const chatFormMethods = createMockChatFormMethods();
  const addedChatContext = createMockAddedChatContext();
  const assistantMap = {};

  mockUseChatFormContext.mockReturnValue(chatFormMethods);
  mockUseChatContext.mockReturnValue(chatContext);
  mockUseAddedChatContext.mockReturnValue(addedChatContext);
  mockUseAssistantsMapContext.mockReturnValue(assistantMap);

  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        recoilState.forEach(([atom, value]) => set(atom, value));
      }}
    >
      <ChatContext.Provider value={chatContext}>
        <ChatFormProvider
          register={chatFormMethods.register}
          control={chatFormMethods.control}
          setValue={chatFormMethods.setValue}
          getValues={chatFormMethods.getValues}
          handleSubmit={chatFormMethods.handleSubmit}
          reset={chatFormMethods.reset}
        >
          <AddedChatContext.Provider value={addedChatContext}>
            <AssistantsMapContext.Provider value={assistantMap}>{ui}</AssistantsMapContext.Provider>
          </AddedChatContext.Provider>
        </ChatFormProvider>
      </ChatContext.Provider>
    </RecoilRoot>,
  );
};

describe('ChatForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChatFormContext.mockReturnValue(createMockChatFormMethods());
    mockUseChatContext.mockReturnValue(createMockChatContext());
    mockUseAddedChatContext.mockReturnValue(createMockAddedChatContext());
    mockUseAssistantsMapContext.mockReturnValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders the form with text input', () => {
      renderWithProviders(<ChatForm />);
      expect(screen.getByTestId('text-input')).toBeInTheDocument();
    });

    it('renders send button when not submitting', () => {
      renderWithProviders(<ChatForm />);
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });

    it('renders stop button when submitting and showStopButton is true', () => {
      renderWithProviders(<ChatForm />, {
        chatContext: { isSubmitting: true },
        recoilState: [[store.showStopButtonByIndex(0), true]],
      });
      expect(screen.getByTestId('stop-button')).toBeInTheDocument();
      expect(screen.queryByTestId('send-button')).not.toBeInTheDocument();
    });

    it('renders audio recorder when speechToText is enabled', () => {
      renderWithProviders(<ChatForm />, {
        recoilState: [[store.speechToText, true]],
      });
      expect(screen.getByTestId('audio-recorder')).toBeInTheDocument();
    });

    it('renders stream audio when textToSpeech and automaticPlayback are enabled', () => {
      renderWithProviders(<ChatForm />, {
        recoilState: [
          [store.textToSpeech, true],
          [store.automaticPlayback, true],
        ],
      });
      expect(screen.getByTestId('stream-audio')).toBeInTheDocument();
    });

    it('applies RTL styles when chatDirection is rtl', () => {
      renderWithProviders(<ChatForm />, {
        recoilState: [[store.chatDirection, 'rtl']],
      });
      const form = document.querySelector('form') as HTMLFormElement;
      const flexElements = form.querySelectorAll('.flex-row-reverse');
      expect(flexElements.length).toBeGreaterThan(0);
    });

    it('applies temporary conversation styles when isTemporary is true', () => {
      renderWithProviders(<ChatForm />, {
        recoilState: [[store.isTemporary, true]],
      });
      const form = document.querySelector('form') as HTMLFormElement;
      expect(form.querySelector('.border-violet-800\\/60')).toBeInTheDocument();
    });

    it('renders mention popover when showMentionPopover is true', () => {
      renderWithProviders(<ChatForm />, {
        recoilState: [[store.showMentionPopoverFamily(0), true]],
      });
      expect(screen.getByTestId('mention')).toBeInTheDocument();
    });

    it('renders plus popover for non-assistants endpoints when showPlusPopover is true', () => {
      renderWithProviders(<ChatForm />, {
        recoilState: [[store.showPlusPopoverFamily(0), true]],
      });
      expect(screen.getAllByTestId('mention')[0]).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('handles maximize chat space state', () => {
      const { unmount } = renderWithProviders(<ChatForm />, {
        recoilState: [[store.maximizeChatSpace, false]],
      });

      let form = document.querySelector('form') as HTMLFormElement;
      expect(form.className).toContain('md:max-w-3xl');
      expect(form.className).not.toContain('max-w-full');

      unmount();

      renderWithProviders(<ChatForm />, {
        recoilState: [[store.maximizeChatSpace, true]],
      });

      form = document.querySelector('form') as HTMLFormElement;
      expect(form.className).toContain('max-w-full');
      expect(form.className).not.toContain('md:max-w-3xl');
    });

    it('handles center form on landing state', () => {
      renderWithProviders(<ChatForm />, {
        recoilState: [[store.centerFormOnLanding, true]],
        chatContext: {
          conversation: {
            conversationId: null,
            endpoint: 'openAI' as EModelEndpoint,
            endpointType: 'openAI' as EModelEndpoint,
            messages: [],
            title: 'New Chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TConversation,
          isSubmitting: false,
        },
      });

      const form = document.querySelector('form') as HTMLFormElement;
      expect(form.className).toContain('sm:mb-28');
    });

    it('manages badges state correctly', async () => {
      renderWithProviders(<ChatForm />, {
        recoilState: [
          [store.chatBadges, [{ id: 'badge1' }]],
          [store.isEditingBadges, true],
        ],
      });

      await waitFor(() => {
        expect(screen.getByTestId('edit-badges')).toBeInTheDocument();
      });
    });

    it('toggles editing badges state', () => {
      const { rerender } = renderWithProviders(<ChatForm />, {
        recoilState: [[store.isEditingBadges, false]],
      });

      expect(screen.getByTestId('edit-badges')).toBeInTheDocument();

      rerender(
        <RecoilRoot initializeState={({ set }) => set(store.isEditingBadges, true)}>
          <ChatContext.Provider value={createMockChatContext()}>
            <ChatFormProvider {...createMockChatFormMethods()}>
              <AddedChatContext.Provider value={createMockAddedChatContext()}>
                <AssistantsMapContext.Provider value={{}}>
                  <ChatForm />
                </AssistantsMapContext.Provider>
              </AddedChatContext.Provider>
            </ChatFormProvider>
          </ChatContext.Provider>
        </RecoilRoot>,
      );

      expect(screen.getByTestId('edit-badges')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('handles form submission', async () => {
      const submitMessage = jest.fn();
      jest.mocked(hooks.useSubmitMessage).mockReturnValue({
        submitMessage,
        submitPrompt: jest.fn(),
      });

      const chatFormMethods = createMockChatFormMethods();
      chatFormMethods.handleSubmit = jest.fn(
        (fn: (data: ChatFormValues) => void | Promise<void>) =>
          async (e?: React.BaseSyntheticEvent) => {
            e?.preventDefault();
            await fn({ text: '' });
          },
      ) as UseFormReturn<ChatFormValues>['handleSubmit'];

      mockUseChatFormContext.mockReturnValue(chatFormMethods);

      render(
        <RecoilRoot>
          <ChatContext.Provider value={createMockChatContext()}>
            <ChatFormProvider
              register={chatFormMethods.register}
              control={chatFormMethods.control}
              setValue={chatFormMethods.setValue}
              getValues={chatFormMethods.getValues}
              handleSubmit={chatFormMethods.handleSubmit}
              reset={chatFormMethods.reset}
            >
              <AddedChatContext.Provider value={createMockAddedChatContext()}>
                <AssistantsMapContext.Provider value={{}}>
                  <ChatForm />
                </AssistantsMapContext.Provider>
              </AddedChatContext.Provider>
            </ChatFormProvider>
          </ChatContext.Provider>
        </RecoilRoot>,
      );

      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(submitMessage).toHaveBeenCalled();
      });
    });

    it('handles text input changes', async () => {
      const user = userEvent.setup();
      const setValue = jest.fn();
      const chatFormMethods = createMockChatFormMethods();
      chatFormMethods.setValue = setValue;
      (chatFormMethods.register as jest.Mock).mockImplementation((name: keyof ChatFormValues) => ({
        ref: jest.fn(),
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
          setValue('text', e.target.value, { shouldValidate: true }),
        onBlur: jest.fn(),
        name,
      }));

      mockUseChatFormContext.mockReturnValue(chatFormMethods);

      render(
        <RecoilRoot>
          <ChatContext.Provider value={createMockChatContext()}>
            <ChatFormProvider
              register={chatFormMethods.register}
              control={chatFormMethods.control}
              setValue={chatFormMethods.setValue}
              getValues={chatFormMethods.getValues}
              handleSubmit={chatFormMethods.handleSubmit}
              reset={chatFormMethods.reset}
            >
              <AddedChatContext.Provider value={createMockAddedChatContext()}>
                <AssistantsMapContext.Provider value={{}}>
                  <ChatForm />
                </AssistantsMapContext.Provider>
              </AddedChatContext.Provider>
            </ChatFormProvider>
          </ChatContext.Provider>
        </RecoilRoot>,
      );

      const textInput = screen.getByTestId('text-input');
      await user.type(textInput, 'Hello world');

      expect(setValue).toHaveBeenCalledWith(
        'text',
        expect.stringContaining('H'),
        expect.any(Object),
      );
    });

    it('focuses text area on container click for non-touch devices', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');
      const focus = jest.spyOn(textInput, 'focus');

      const container = textInput.closest('.relative.flex.w-full');
      if (!container) throw new Error('Container not found');
      fireEvent.click(container);

      expect(focus).toHaveBeenCalled();

      window.matchMedia = originalMatchMedia;
    });

    it('does not focus text area on container click for touch devices', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');
      const focus = jest.spyOn(textInput, 'focus');

      const container = textInput.closest('.relative.flex.w-full');
      if (!container) throw new Error('Container not found');
      fireEvent.click(container);

      expect(focus).not.toHaveBeenCalled();

      window.matchMedia = originalMatchMedia;
    });

    it('handles stop button click', async () => {
      const handleStopGenerating = jest.fn();

      renderWithProviders(<ChatForm />, {
        chatContext: { isSubmitting: true, handleStopGenerating },
        recoilState: [[store.showStopButtonByIndex(0), true]],
      });

      const stopButton = screen.getByTestId('stop-button');
      fireEvent.click(stopButton);

      expect(handleStopGenerating).toHaveBeenCalled();
    });

    it('expands collapsed chat on focus', () => {
      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');

      fireEvent.focus(textInput);

      expect(textInput.parentElement?.parentElement?.className).not.toContain('max-h-[52px]');
    });

    it('manages text area focus state', () => {
      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');
      const container = textInput.closest('.relative.flex.w-full');

      expect(container?.className).toContain('shadow-md');

      fireEvent.focus(textInput);
      expect(container?.className).toContain('shadow-lg');

      fireEvent.blur(textInput);
      expect(container?.className).toContain('shadow-md');
    });
  });

  describe('Disabled States', () => {
    it('disables inputs when requiresKey is true', () => {
      jest.mocked(hooks.useRequiresKey).mockReturnValue({ requiresKey: true });

      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');
      expect(textInput).toBeDisabled();
    });

    it('disables inputs for invalid assistant', () => {
      renderWithProviders(<ChatForm />, {
        chatContext: {
          conversation: {
            endpoint: 'assistants' as EModelEndpoint,
            endpointType: 'assistants' as EModelEndpoint,
            assistant_id: 'invalid-id',
            conversationId: 'test-id',
            title: 'Test',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TConversation,
        },
      });

      const textInput = screen.getByTestId('text-input');
      expect(textInput).toBeDisabled();
    });

    it('disables inputs when isNotAppendable is true', () => {
      (jest.mocked(hooks.useTextarea) as jest.Mock).mockReturnValue({
        isNotAppendable: true,
        handlePaste: jest.fn(),
        handleKeyDown: jest.fn(),
        handleCompositionStart: jest.fn(),
        handleCompositionEnd: jest.fn(),
      });

      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');
      expect(textInput).toBeDisabled();
    });

    it('disables send button when files are loading', () => {
      renderWithProviders(<ChatForm />, {
        chatContext: { filesLoading: true },
      });

      const sendButton = screen.getByTestId('send-button');
      expect(sendButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('handles missing endpoint gracefully', () => {
      renderWithProviders(<ChatForm />, {
        chatContext: {
          conversation: {
            endpoint: null,
            conversationId: 'test-id',
            title: 'Test',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TConversation,
        },
      });

      expect(screen.queryByTestId('text-input')).not.toBeInTheDocument();
    });

    it('handles assistant endpoint without showing plus popover', () => {
      renderWithProviders(<ChatForm />, {
        chatContext: {
          conversation: {
            endpoint: 'assistants' as EModelEndpoint,
            endpointType: 'assistants' as EModelEndpoint,
            conversationId: 'test-id',
            title: 'Test',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TConversation,
        },
        recoilState: [
          [store.showPlusPopoverFamily(0), true],
          [store.showMentionPopoverFamily(0), false],
        ],
      });

      expect(screen.queryAllByTestId('mention').length).toBe(0);
    });

    it('calculates visual row count based on text content', async () => {
      const user = userEvent.setup();

      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        value: 120,
      });

      global.getComputedStyle = jest.fn().mockReturnValue({
        lineHeight: '20px',
      });

      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');
      await user.type(textInput, 'Line 1\nLine 2\nLine 3\nLine 4');

      await waitFor(() => {
        const form = document.querySelector('form');
        const textareaDiv = form?.querySelector('.max-h-\\[45vh\\]');
        expect(textareaDiv?.className).toContain('pl-5');
      });
    });

    it('handles new conversation with centered form', () => {
      renderWithProviders(<ChatForm />, {
        chatContext: {
          conversation: {
            conversationId: 'new',
            endpoint: 'openAI' as EModelEndpoint,
            endpointType: 'openAI' as EModelEndpoint,
            messages: [],
            title: 'New Chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TConversation,
          isSubmitting: false,
        },
        recoilState: [[store.centerFormOnLanding, true]],
      });

      const form = document.querySelector('form') as HTMLFormElement;
      expect(form.className).toContain('sm:mb-28');
    });

    it('handles conversation with messages differently', () => {
      renderWithProviders(<ChatForm />, {
        chatContext: {
          conversation: {
            conversationId: 'test-id',
            endpoint: 'openAI' as EModelEndpoint,
            endpointType: 'openAI' as EModelEndpoint,
            messages: ['1'],
            title: 'Test Chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TConversation,
          isSubmitting: false,
        },
        recoilState: [[store.centerFormOnLanding, true]],
      });

      const form = document.querySelector('form') as HTMLFormElement;
      expect(form.className).toContain('sm:mb-10');
    });

    it('handles agent endpoint badge rendering', () => {
      renderWithProviders(<ChatForm />, {
        chatContext: {
          conversation: {
            endpoint: 'agents' as EModelEndpoint,
            endpointType: 'agents' as EModelEndpoint,
            conversationId: 'test-id',
            title: 'Agent Chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TConversation,
        },
      });

      expect(screen.getByTestId('badge-row')).toBeInTheDocument();
    });

    it('maintains backup badges when starting edit', () => {
      const badges = [{ id: '1' }, { id: '2' }];

      renderWithProviders(<ChatForm />, {
        recoilState: [
          [store.chatBadges, badges],
          [store.isEditingBadges, true],
        ],
      });

      expect(screen.getByTestId('edit-badges')).toBeInTheDocument();
    });

    it('handles collapsed state transitions', () => {
      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');

      fireEvent.click(textInput);

      const baseClasses = textInput.className;
      expect(baseClasses).toContain('max-h-[45vh]');
    });

    it('handles composition events through useTextarea hook', () => {
      const handleCompositionStart = jest.fn();
      const handleCompositionEnd = jest.fn();

      (jest.mocked(hooks.useTextarea) as jest.Mock).mockReturnValue({
        isNotAppendable: false,
        handlePaste: jest.fn(),
        handleKeyDown: jest.fn(),
        handleCompositionStart,
        handleCompositionEnd,
      });

      renderWithProviders(<ChatForm />);

      const textInput = screen.getByTestId('text-input');

      fireEvent.compositionStart(textInput);
      expect(handleCompositionStart).toHaveBeenCalled();

      fireEvent.compositionEnd(textInput);
      expect(handleCompositionEnd).toHaveBeenCalled();
    });
  });
});
