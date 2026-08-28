import React from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FileCitation, TMessage, TMessageContentParts } from 'librechat-data-provider';
import EditContentParts from '../EditContentParts';

const mockMutateAsync = jest.fn();
const mockSetMessages = jest.fn();
const mockAsk = jest.fn();
let mockChatDirection = 'LTR';

jest.mock('recoil', () => ({
  useRecoilValue: () => mockChatDirection,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { chatDirection: {} },
}));

const message = {
  messageId: 'assistant-1',
  parentMessageId: 'user-1',
  conversationId: 'conversation-1',
  isCreatedByUser: false,
} as TMessage;

const parentMessage = {
  messageId: 'user-1',
  conversationId: 'conversation-1',
  isCreatedByUser: true,
  text: 'Check the service',
} as TMessage;

jest.mock('librechat-data-provider/react-query', () => ({
  useUpdateMessageContentMutation: () => ({
    mutateAsync: mockMutateAsync,
    isLoading: false,
  }),
}));

jest.mock('~/Providers', () => ({
  useMessagesConversation: () => ({
    conversation: { conversationId: 'conversation-1' },
  }),
  useMessagesOperations: () => ({
    ask: mockAsk,
    getMessages: () => [parentMessage, message],
    setMessages: mockSetMessages,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/Chat', () => ({
  useGetAddedConvo: () => () => null,
}));

const content = [
  { type: ContentTypes.TEXT, text: 'Current response' },
  {
    type: ContentTypes.TOOL_CALL,
    tool_call: { type: 'tool_call', name: 'status', args: '{}', output: 'ok' },
  },
  { type: ContentTypes.ERROR, error: 'A visible tool error' },
] as TMessageContentParts[];

describe('EditContentParts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateAsync.mockReset();
    mockAsk.mockReset();
    mockMutateAsync.mockResolvedValue({});
    mockChatDirection = 'LTR';
    message.content = undefined;
  });

  it('uses one editor footer and keeps non-editable parts visible', () => {
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={(part) => <div data-testid={`read-only-${part.type}`}>{part.type}</div>}
      />,
    );

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByTestId(`read-only-${ContentTypes.TOOL_CALL}`)).toBeInTheDocument();
    expect(screen.getByTestId(`read-only-${ContentTypes.ERROR}`)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('saves changed text parts before closing the editor', async () => {
    const enterEdit = jest.fn();
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={enterEdit}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Updated response' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        index: 0,
        conversationId: 'conversation-1',
        text: 'Updated response',
        messageId: message.messageId,
      }),
    );
    expect(mockSetMessages).toHaveBeenCalledTimes(1);
    expect(enterEdit).toHaveBeenCalledWith(true);
  });

  it('clears the cached reasoning title when its reasoning text is edited', async () => {
    const reasoningContent = [
      {
        type: ContentTypes.THINK,
        think: 'Original reasoning',
        agentId: 'agent-1',
        reasoning_label: 'Inspecting the original path',
        reasoning_label_step_id: 'reasoning-step-1',
        reasoning_label_attempts: 3,
        reasoning_label_submitted_chars: 18,
        reasoning_label_revision: 2,
        reasoning_label_status: 'complete',
      },
    ] as TMessageContentParts[];
    message.content = reasoningContent;

    render(
      <EditContentParts
        content={reasoningContent}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited reasoning' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() => expect(mockSetMessages).toHaveBeenCalledTimes(1));
    const reconciled = mockSetMessages.mock.calls[0][0] as TMessage[];
    const edited = reconciled.find((item) => item.messageId === message.messageId);
    expect(edited?.content).toEqual([
      {
        type: ContentTypes.THINK,
        think: 'Edited reasoning',
        agentId: 'agent-1',
      },
    ]);
  });

  it('reruns an assistant response with the edited content value', () => {
    const enterEdit = jest.fn();
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={enterEdit}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rerun response' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_update_rerun' }));

    expect(mockAsk).toHaveBeenCalledWith(
      parentMessage,
      expect.objectContaining({
        editedContent: {
          index: 0,
          type: ContentTypes.TEXT,
          [ContentTypes.TEXT]: 'Rerun response',
        },
      }),
    );
    expect(enterEdit).toHaveBeenCalledWith(true);
  });

  it('keeps the editor open with the drafts when a rerun is refused mid-stream', () => {
    const enterEdit = jest.fn();
    const setSiblingIdx = jest.fn();
    mockAsk.mockReturnValue(false);
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={enterEdit}
        siblingIdx={0}
        setSiblingIdx={setSiblingIdx}
        renderReadOnlyPart={() => null}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Refused rerun' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_update_rerun' }));

    expect(mockAsk).toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('Refused rerun');
    expect(setSiblingIdx).not.toHaveBeenCalled();
    expect(enterEdit).not.toHaveBeenCalled();
  });

  /** The rerun that matters most needs no edit at all: a cancelled response, or a
   *  backend restarted on different parameters, has to be reissued untouched. */
  it('reruns an unchanged assistant response as a regeneration', () => {
    const enterEdit = jest.fn();
    const setSiblingIdx = jest.fn();
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={enterEdit}
        siblingIdx={0}
        setSiblingIdx={setSiblingIdx}
        renderReadOnlyPart={() => null}
      />,
    );

    const rerun = screen.getByRole('button', { name: 'com_ui_rerun' });
    expect(rerun).toBeEnabled();
    fireEvent.click(rerun);

    expect(mockAsk).toHaveBeenCalledWith(
      parentMessage,
      expect.objectContaining({
        isRegenerate: true,
        targetResponseMessageId: message.messageId,
      }),
    );
    /** Replaying the untouched part as an edit would retain this answer and append a
     *  second one to it rather than produce a new one. */
    expect(mockAsk.mock.calls[0][1]).not.toHaveProperty('editedContent');
    /** The regenerated answer is a sibling of this response, not of the user turn the
     *  sibling index walks. */
    expect(setSiblingIdx).not.toHaveBeenCalled();
    expect(enterEdit).toHaveBeenCalledWith(true);
  });

  it('reruns an unchanged user request with its original text', () => {
    const enterEdit = jest.fn();
    const setSiblingIdx = jest.fn();
    const userContent = [
      { type: ContentTypes.TEXT, text: parentMessage.text },
    ] as TMessageContentParts[];

    render(
      <EditContentParts
        content={userContent}
        messageId={parentMessage.messageId}
        isSubmitting={false}
        enterEdit={enterEdit}
        siblingIdx={0}
        setSiblingIdx={setSiblingIdx}
        renderReadOnlyPart={() => null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_rerun' }));

    expect(mockAsk).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Check the service',
        conversationId: parentMessage.conversationId,
      }),
      expect.objectContaining({ overrideFiles: parentMessage.files }),
    );
    expect(setSiblingIdx).toHaveBeenCalledWith(-1);
    expect(enterEdit).toHaveBeenCalledWith(true);
  });

  it('names the rerun after the edit only once a part differs', () => {
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    expect(screen.getByRole('button', { name: 'com_ui_rerun' })).toBeEnabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Changed response' } });

    expect(screen.queryByRole('button', { name: 'com_ui_rerun' })).toBeNull();
    expect(screen.getByRole('button', { name: 'com_ui_update_rerun' })).toBeEnabled();
  });

  it('requires multi-part assistant edits to be saved before rerunning', () => {
    const multiPartContent = [
      { type: ContentTypes.TEXT, text: 'First response' },
      { type: ContentTypes.TEXT, text: 'Second response' },
    ] as TMessageContentParts[];

    render(
      <EditContentParts
        content={multiPartContent}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    const editors = screen.getAllByRole('textbox');
    fireEvent.change(editors[0], { target: { value: 'Updated first response' } });
    fireEvent.change(editors[1], { target: { value: 'Updated second response' } });

    expect(screen.getByRole('button', { name: 'com_ui_update_rerun' })).toBeDisabled();
    expect(screen.getByText('com_ui_save_before_rerun')).toBeInTheDocument();
  });

  it('reconciles the parts that were persisted when a later part is refused', async () => {
    const enterEdit = jest.fn();
    const multiPartContent = [
      { type: ContentTypes.TEXT, text: 'First response' },
      { type: ContentTypes.TEXT, text: 'Second response' },
    ] as TMessageContentParts[];
    message.content = multiPartContent;
    mockMutateAsync
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('the second write was refused'));

    render(
      <EditContentParts
        content={multiPartContent}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={enterEdit}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    const editors = screen.getAllByRole('textbox');
    fireEvent.change(editors[0], { target: { value: 'Updated first response' } });
    fireEvent.change(editors[1], { target: { value: 'Updated second response' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(await screen.findByText('com_ui_save_message_error')).toBeInTheDocument();
    expect(mockMutateAsync).toHaveBeenCalledTimes(2);

    /** The first write is on the server whatever the second one did, so the transcript
     *  has to show it rather than report that the whole save was lost. */
    expect(mockSetMessages).toHaveBeenCalledTimes(1);
    const reconciled = mockSetMessages.mock.calls[0][0] as TMessage[];
    const edited = reconciled.find((item) => item.messageId === message.messageId);
    expect(edited?.content).toEqual([
      { type: ContentTypes.TEXT, text: 'Updated first response' },
      { type: ContentTypes.TEXT, text: 'Second response' },
    ]);

    /** The refused part is the only one still holding an unsaved draft, so the editor
     *  stays open on it and a retry does not rewrite what already landed. */
    expect(enterEdit).not.toHaveBeenCalled();
    expect(screen.getAllByRole('textbox')[1]).toHaveValue('Updated second response');
  });

  /**
   * The Assistants thread sync stores a response carrying file citations as
   * `{ value, annotations }`, and the editor reads that through the same union it
   * reads a bare string with. Writing the draft over the whole value dropped the
   * citations from the transcript, and they stayed dropped until a refetch.
   */
  it('edits inside a structured text part rather than flattening the cached one', async () => {
    const annotations: FileCitation[] = [
      {
        type: 'file_citation',
        text: 'source',
        start_index: 0,
        end_index: 6,
        file_citation: { file_id: 'file-1', quote: 'the cited passage' },
      },
    ];
    const structuredContent = [
      { type: ContentTypes.TEXT, text: { value: 'Cited response', annotations } },
    ] as TMessageContentParts[];
    message.content = structuredContent;

    render(
      <EditContentParts
        content={structuredContent}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    /** Read back through the union, so the editor opens on the text and not on the wrapper. */
    const editor = screen.getByRole('textbox');
    expect(editor).toHaveValue('Cited response');

    fireEvent.change(editor, { target: { value: 'Edited cited response' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() => expect(mockSetMessages).toHaveBeenCalledTimes(1));
    const reconciled = mockSetMessages.mock.calls[0][0] as TMessage[];
    const edited = reconciled.find((item) => item.messageId === message.messageId);
    expect(edited?.content).toEqual([
      { type: ContentTypes.TEXT, text: { value: 'Edited cited response', annotations } },
    ]);
  });

  it('keeps artifact-bearing text in the specialized read-only renderer', () => {
    const artifactContent = [
      {
        type: ContentTypes.TEXT,
        text: ':::artifact{identifier="demo" type="text/html" title="Demo"}\n<div />\n:::',
      },
    ] as TMessageContentParts[];

    render(
      <EditContentParts
        content={artifactContent}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={(part) => <div data-testid="artifact-part">{part.type}</div>}
      />,
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByTestId('artifact-part')).toBeInTheDocument();
  });

  it('refuses to persist a part the editor has been emptied of', async () => {
    const enterEdit = jest.fn();
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={enterEdit}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_update_rerun' })).toBeDisabled();
    expect(screen.getByText('com_ui_message_part_empty')).toBeInTheDocument();

    /** The shortcuts reach the save paths directly, so a disabled button is not
     *  enough on its own. */
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(mockMutateAsync).not.toHaveBeenCalled());
    expect(mockAsk).not.toHaveBeenCalled();
    expect(enterEdit).not.toHaveBeenCalled();
  });

  it('lets a restored part save again after being emptied', async () => {
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: '' } });
    fireEvent.change(editor, { target: { value: 'Restored response' } });

    expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Restored response' }),
      ),
    );
  });

  it('turns the editor around for a right-to-left chat direction', () => {
    mockChatDirection = 'RTL';
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveAttribute('dir', 'rtl');
    expect(editor).toHaveClass('text-right');
  });

  it('leaves the editor left-to-right by default', () => {
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveAttribute('dir', 'ltr');
    expect(editor).toHaveClass('text-left');
  });

  it('sizes the editor from the configured message font rather than pinning it', () => {
    render(
      <EditContentParts
        content={content}
        messageId={message.messageId}
        isSubmitting={false}
        enterEdit={jest.fn()}
        siblingIdx={0}
        setSiblingIdx={jest.fn()}
        renderReadOnlyPart={() => null}
      />,
    );

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveClass('message-editor-text');
    expect(editor).not.toHaveClass('text-sm');
  });
});
