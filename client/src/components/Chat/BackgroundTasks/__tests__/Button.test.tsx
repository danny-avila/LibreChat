import React from 'react';
import { RecoilRoot } from 'recoil';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentTypes, QueryKeys, dataService } from 'librechat-data-provider';
import type { ParentSubagentSummary, BackgroundTaskIndex, TMessage } from 'librechat-data-provider';
import { ParentSubagentsProvider } from '~/components/Chat/Subagents/ParentSubagentsProvider';
import BackgroundTasksButton from '../Button';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const conversationId = 'convo-1';
const startedAt = new Date(Date.now() - 30_000).toISOString();

const index = (overrides: Partial<BackgroundTaskIndex> = {}): BackgroundTaskIndex => ({
  conversationId,
  cancellable: true,
  tasks: [
    {
      taskId: 'task-running',
      toolName: 'bash_tool',
      toolCallId: 'call-running',
      status: 'running',
      cancellationRequested: false,
      startedAt,
    },
    {
      taskId: 'task-done',
      toolName: 'bash_tool',
      toolCallId: 'call-done',
      status: 'completed',
      cancellationRequested: false,
      startedAt,
      settledAt: new Date().toISOString(),
    },
  ],
  ...overrides,
});

const runningChild: ParentSubagentSummary = {
  threadId: 'thread-1',
  parentMessageId: 'parent-message',
  parentToolCallId: 'call-subagent',
  subagentType: 'researcher',
  subagentKind: 'agent',
  title: 'Research the API',
  origin: 'tool',
  status: 'running',
  latestTaskId: 'sub-task-1',
  tasks: [{ taskId: 'sub-task-1', status: 'running', createdAt: startedAt }],
  tasksTruncated: false,
};

const messages: TMessage[] = [
  {
    messageId: 'message-1',
    conversationId,
    parentMessageId: null,
    isCreatedByUser: false,
    text: '',
    content: [
      {
        type: ContentTypes.TOOL_CALL,
        [ContentTypes.TOOL_CALL]: {
          id: 'call-running',
          name: 'bash_tool',
          args: '{"intent":"Rerun the focused specs","command":"npx jest tasks.spec.ts"}',
        },
      },
    ],
  } as TMessage,
];

const renderButton = (children: ParentSubagentSummary[] = []) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData([QueryKeys.messages, conversationId], messages);
  jest.spyOn(dataService, 'getParentSubagents').mockResolvedValue({
    parentConversationId: conversationId,
    children,
    childrenTruncated: false,
  });
  return render(
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>
        <ParentSubagentsProvider conversationId={conversationId} enabled>
          <BackgroundTasksButton conversationId={conversationId} isSubmitting={false} />
        </ParentSubagentsProvider>
      </QueryClientProvider>
    </RecoilRoot>,
  );
};

afterEach(() => jest.restoreAllMocks());

describe('BackgroundTasksButton', () => {
  it('renders nothing when the conversation has no background tasks', async () => {
    const getTasks = jest
      .spyOn(dataService, 'getBackgroundTasks')
      .mockResolvedValue(index({ tasks: [] }));
    const { container } = renderButton();
    await waitFor(() => expect(getTasks).toHaveBeenCalledWith(conversationId));
    expect(container).toBeEmptyDOMElement();
  });

  it('groups running and finished tasks and reveals the command on demand', async () => {
    jest.spyOn(dataService, 'getBackgroundTasks').mockResolvedValue(index());
    renderButton();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('header-background-tasks-button'));
    const dialog = await screen.findByRole('dialog', { name: 'com_ui_background_tasks' });
    const title = within(dialog).getByRole('button', { name: 'Rerun the focused specs' });
    expect(within(dialog).getAllByTestId('background-task-row')).toHaveLength(2);
    expect(within(dialog).queryByText('npx jest tasks.spec.ts')).toBeNull();

    await user.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByText('npx jest tasks.spec.ts')).toBeInTheDocument();

    const finished = within(dialog).getByRole('button', {
      name: /com_ui_background_tasks_finished/,
    });
    await user.click(finished);
    expect(finished).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).getAllByTestId('background-task-row')).toHaveLength(1);
  });

  it('stops every running tool and subagent from the running row, even when collapsed', async () => {
    jest.spyOn(dataService, 'getBackgroundTasks').mockResolvedValue(index());
    const cancelTools = jest
      .spyOn(dataService, 'cancelBackgroundTasks')
      .mockResolvedValue({ results: [{ taskId: 'task-running', status: 'requested' }] });
    const cancelSubagent = jest.spyOn(dataService, 'controlSubagentTask').mockResolvedValue({
      receipt: {
        invocationId: 'invocation',
        action: 'cancel',
        status: 'accepted',
        createdAt: startedAt,
        updatedAt: startedAt,
      },
    });
    renderButton([runningChild]);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('header-background-tasks-button'));
    const dialog = await screen.findByRole('dialog', { name: 'com_ui_background_tasks' });
    await waitFor(() =>
      expect(within(dialog).getAllByTestId('background-task-row')).toHaveLength(3),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /com_ui_background_tasks_running/ }),
    );
    await user.click(within(dialog).getByTestId('background-tasks-stop-all'));

    await waitFor(() =>
      expect(cancelTools).toHaveBeenCalledWith(conversationId, { taskIds: ['task-running'] }),
    );
    expect(cancelSubagent).toHaveBeenCalledWith(
      conversationId,
      'thread-1',
      expect.objectContaining({ taskId: 'sub-task-1', action: 'cancel' }),
    );
  });

  it('keeps stop-all disabled when the server does not allow tool cancellation', async () => {
    jest.spyOn(dataService, 'getBackgroundTasks').mockResolvedValue(index({ cancellable: false }));
    const cancelTools = jest.spyOn(dataService, 'cancelBackgroundTasks');
    renderButton();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('header-background-tasks-button'));
    const stopAll = await screen.findByTestId('background-tasks-stop-all');
    expect(stopAll).toBeDisabled();
    expect(stopAll).toHaveAccessibleName('com_ui_background_tasks_cancel_disabled');
    expect(screen.queryByRole('button', { name: /com_ui_background_tasks_stop:/ })).toBeNull();
    expect(cancelTools).not.toHaveBeenCalled();
  });
});
