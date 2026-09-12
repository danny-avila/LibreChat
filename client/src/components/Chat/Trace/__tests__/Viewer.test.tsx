import React from 'react';
import userEvent from '@testing-library/user-event';
import { dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import type { TTracePage, TTraceRecord, TStartupConfig } from 'librechat-data-provider';
import Viewer from '../Viewer';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

type MockStartupConfig = Omit<Partial<TStartupConfig>, 'interface'> & {
  interface?: Partial<NonNullable<TStartupConfig['interface']>>;
};

let mockStartupConfig: MockStartupConfig = {};

jest.mock('~/data-provider/Endpoints/queries', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string>) =>
    options ? `${key} ${Object.values(options).join(' ')}` : key,
}));

const BASE = Date.UTC(2026, 8, 12, 11, 30, 0);
const at = (offsetMs: number) => new Date(BASE + offsetMs).toISOString();

function record(overrides: Partial<TTraceRecord> & Pick<TTraceRecord, 'id'>): TTraceRecord {
  return {
    traceId: 'trace-1',
    messageId: 'response-1',
    parentId: null,
    kind: 'span',
    name: overrides.id,
    startTime: at(0),
    endTime: at(1000),
    status: 'ok',
    ...overrides,
  };
}

const records: TTraceRecord[] = [
  record({ id: 'root', kind: 'agent', name: 'AgentGraph', startTime: at(0), endTime: at(4000) }),
  record({
    id: 'llm',
    parentId: 'root',
    kind: 'generation',
    name: 'llm',
    model: 'gpt-5',
    startTime: at(100),
    endTime: at(2100),
    completionStartTime: at(600),
    usage: { input: 1200, output: 300, total: 1500 },
    cost: 0.02,
  }),
  record({
    id: 'tool',
    parentId: 'root',
    kind: 'tool',
    name: 'web_search',
    status: 'error',
    statusMessage: 'Error: search backend unavailable',
    startTime: at(2200),
    endTime: at(3000),
  }),
];

function axiosError(status: number, errorCode: string) {
  return Object.assign(new Error(errorCode), {
    isAxiosError: true,
    response: { status, data: { error: errorCode, errorCode } },
  });
}

function renderViewer(onClose = jest.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <Viewer conversationId="convo-1" onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...utils, onClose, client };
}

const treeItem = (name: RegExp) => screen.findByRole('treeitem', { name });

describe('Trace Viewer', () => {
  beforeEach(() => {
    mockStartupConfig = { interface: { traceViewer: { enabled: true } } };
    jest
      .spyOn(dataService, 'getConversationTraceRecords')
      .mockResolvedValue({ records, sourceId: 'tenant-project' } satisfies TTracePage);
    jest.spyOn(dataService, 'getConversationTraceRecord').mockResolvedValue({
      record: records[1],
      contentAvailable: true,
      input: { value: '{"messages":[{"role":"user","content":"hi"}]}', truncated: false },
      output: { value: 'partial outp', truncated: true },
    });
    jest.spyOn(dataService, 'getLangfuseSessionLink').mockResolvedValue({
      url: 'https://langfuse.test/project/p/sessions/convo-1',
      destinationId: 'tenant-project',
    });
  });

  it('shows a loading state, then the summary, overview and record tree', async () => {
    renderViewer();

    expect(screen.getByRole('status')).toHaveTextContent('com_ui_trace_loading');
    expect(await treeItem(/AgentGraph/)).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /llm/ })).toHaveAttribute('aria-level', '3');
    expect(
      screen.getByRole('treeitem', { name: /web_search.*com_ui_trace_status_error/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /^com_ui_trace_turn/ })).toHaveAttribute(
      'aria-level',
      '1',
    );

    const summary = screen.getByLabelText('com_ui_trace_summary');
    expect(
      within(summary).getByText('com_ui_trace_summary_generations').nextSibling,
    ).toHaveTextContent('1');
    expect(within(summary).getByText('com_ui_trace_summary_errors').nextSibling).toHaveTextContent(
      '1',
    );
    expect(within(summary).queryByText('com_ui_trace_summary_cost')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-overview')).toBeInTheDocument();
    expect(dataService.getConversationTraceRecords).toHaveBeenCalledWith(
      { conversationId: 'convo-1', cursor: undefined },
      expect.any(AbortSignal),
    );
  });

  it('shows cost only when the deployment shows context cost', async () => {
    mockStartupConfig = { interface: { traceViewer: { enabled: true }, contextCost: true } };
    renderViewer();

    await treeItem(/AgentGraph/);
    expect(screen.getByText('com_ui_trace_summary_cost')).toBeInTheDocument();
  });

  it('explains a failure by its error code and recovers on retry', async () => {
    jest
      .spyOn(dataService, 'getConversationTraceRecords')
      .mockRejectedValueOnce(axiosError(501, 'unsupported'));
    renderViewer();

    expect(await screen.findByText('com_ui_trace_error_unsupported')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));

    expect(await treeItem(/AgentGraph/)).toBeInTheDocument();
  });

  it('falls back to a generic message for an unknown failure', async () => {
    jest
      .spyOn(dataService, 'getConversationTraceRecords')
      .mockRejectedValueOnce(new Error('network down'));
    renderViewer();

    expect(await screen.findByText('com_ui_trace_error_generic')).toBeInTheDocument();
  });

  it('shows an empty state that can refresh when no records have arrived yet', async () => {
    const list = jest
      .spyOn(dataService, 'getConversationTraceRecords')
      .mockResolvedValueOnce({ records: [] });
    renderViewer();

    const title = await screen.findByText('com_ui_trace_empty_title');
    const emptyState = title.parentElement as HTMLElement;
    await userEvent.click(within(emptyState).getByRole('button', { name: 'com_ui_trace_refresh' }));

    expect(await treeItem(/AgentGraph/)).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('inspects a record without requesting content the deployment withholds', async () => {
    renderViewer();

    await userEvent.click(await treeItem(/llm/));

    const inspector = screen.getByTestId('trace-inspector');
    expect(within(inspector).getByRole('heading', { name: 'llm' })).toBeInTheDocument();
    expect(within(inspector).getByText('com_ui_trace_ttft')).toBeInTheDocument();
    expect(within(inspector).getByText('com_ui_trace_decoding')).toBeInTheDocument();
    expect(within(inspector).getByText('gpt-5')).toBeInTheDocument();
    expect(within(inspector).queryByText('com_ui_trace_content')).not.toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /llm/ })).toHaveAttribute('aria-selected', 'true');
    expect(dataService.getConversationTraceRecord).not.toHaveBeenCalled();
  });

  it('loads input and output for the selected record when the deployment allows it', async () => {
    mockStartupConfig = { interface: { traceViewer: { enabled: true, showInputOutput: true } } };
    renderViewer();

    await userEvent.click(await treeItem(/llm/));

    const inspector = screen.getByTestId('trace-inspector');
    expect(await within(inspector).findByText(/"content": "hi"/)).toBeInTheDocument();
    expect(within(inspector).getByText('partial outp')).toBeInTheDocument();
    expect(within(inspector).getByText('com_ui_trace_truncated')).toBeInTheDocument();
    expect(dataService.getConversationTraceRecord).toHaveBeenCalledWith(
      { conversationId: 'convo-1', recordId: 'llm', sourceId: 'tenant-project' },
      expect.any(AbortSignal),
    );
  });

  it('shows the error message for a failed record', async () => {
    renderViewer();

    await userEvent.click(await treeItem(/web_search/));

    expect(
      within(screen.getByTestId('trace-inspector')).getByText('Error: search backend unavailable'),
    ).toBeInTheDocument();
  });

  it('filters the tree by search and keeps the match context', async () => {
    renderViewer();
    await treeItem(/AgentGraph/);

    await userEvent.type(screen.getByLabelText('com_ui_trace_search'), 'web');

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /llm/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('treeitem', { name: /AgentGraph/ })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /web_search/ })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('com_ui_trace_search'));
    await userEvent.type(screen.getByLabelText('com_ui_trace_search'), 'nothing matches');
    expect(await screen.findByText('com_ui_trace_no_matches')).toBeInTheDocument();
  });

  it('folds and unfolds rows from the keyboard', async () => {
    renderViewer();
    const root = await treeItem(/AgentGraph/);
    const tree = screen.getByRole('tree');

    await userEvent.click(root);
    expect(root).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /llm/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('treeitem', { name: /AgentGraph/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(await treeItem(/llm/)).toBeInTheDocument();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(tree).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('treeitem', { name: /llm/ }).id,
    );
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(screen.getByTestId('trace-inspector')).toBeInTheDocument();
  });

  it('collapses and expands everything', async () => {
    renderViewer();
    await treeItem(/AgentGraph/);

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_trace_collapse_all' }));
    expect(screen.queryByRole('treeitem', { name: /AgentGraph/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_trace_expand_all' }));
    expect(screen.getByRole('treeitem', { name: /llm/ })).toBeInTheDocument();
  });

  it('focuses an interval from the overview keyboard and clears it', async () => {
    renderViewer();
    await treeItem(/AgentGraph/);
    const overview = screen.getByTestId('trace-overview');

    fireEvent.keyDown(overview, { key: '+' });

    expect(screen.getByTestId('trace-overview-selection')).toBeInTheDocument();
    expect(screen.getByText(/^com_ui_trace_selection/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_trace_clear_selection' }));
    expect(screen.queryByTestId('trace-overview-selection')).not.toBeInTheDocument();
  });

  it('loads older records on demand and merges them into the tree', async () => {
    const list = jest
      .spyOn(dataService, 'getConversationTraceRecords')
      .mockImplementation(async ({ cursor }) =>
        cursor == null
          ? { records: records.slice(1), nextCursor: 'older' }
          : { records: records.slice(0, 1) },
      );
    renderViewer();

    expect(await screen.findByText('com_ui_trace_partial 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_trace_load_older' }));

    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /llm/ })).toHaveAttribute('aria-level', '3'),
    );
    expect(list).toHaveBeenLastCalledWith(
      { conversationId: 'convo-1', cursor: 'older' },
      expect.any(AbortSignal),
    );
    expect(
      screen.queryByRole('button', { name: 'com_ui_trace_load_older' }),
    ).not.toBeInTheDocument();
  });

  it('closes the inspector on Escape before closing the trace', async () => {
    const { onClose } = renderViewer();
    await userEvent.click(await treeItem(/llm/));

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('trace-inspector')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('links to Langfuse only for users who manage the connection', async () => {
    const first = renderViewer();
    await treeItem(/AgentGraph/);
    expect(
      screen.queryByRole('link', { name: /com_ui_trace_open_langfuse/ }),
    ).not.toBeInTheDocument();
    expect(dataService.getLangfuseSessionLink).not.toHaveBeenCalled();
    first.unmount();

    mockStartupConfig = {
      interface: { traceViewer: { enabled: true } },
      langfuseConnectionAccess: true,
    };
    renderViewer();

    const link = await screen.findByRole('link', { name: /com_ui_trace_open_langfuse/ });
    expect(link).toHaveAttribute('href', 'https://langfuse.test/project/p/sessions/convo-1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not link to a Langfuse project other than the one that served the trace', async () => {
    mockStartupConfig = {
      interface: { traceViewer: { enabled: true } },
      langfuseConnectionAccess: true,
    };
    jest
      .spyOn(dataService, 'getConversationTraceRecords')
      .mockResolvedValue({ records, sourceId: 'central-project' });
    renderViewer();

    await treeItem(/AgentGraph/);
    await waitFor(() => expect(dataService.getLangfuseSessionLink).toHaveBeenCalled());
    expect(
      screen.queryByRole('link', { name: /com_ui_trace_open_langfuse/ }),
    ).not.toBeInTheDocument();
  });

  it('cancels an in-flight trace read when the viewer closes', async () => {
    let signal: AbortSignal | undefined;
    jest
      .spyOn(dataService, 'getConversationTraceRecords')
      .mockImplementation((_params, requestSignal) => {
        signal = requestSignal;
        return new Promise(() => undefined);
      });
    const { unmount } = renderViewer();
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    await waitFor(() => expect(signal?.aborted).toBe(true));
  });

  it('moves focus into the trace when it opens', async () => {
    renderViewer();

    expect(screen.getByRole('button', { name: 'com_ui_trace_close' })).toHaveFocus();
  });
});
