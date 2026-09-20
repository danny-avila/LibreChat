import React from 'react';
import { RecoilRoot } from 'recoil';
import { ContentTypes, Tools } from 'librechat-data-provider';
import { act, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import ContentParts from '../ContentParts';

/**
 * Parity between a live fold and the cards it unmounts.
 *
 * The folded row takes over everything its hidden cards used to say, so the
 * contract is agreement, not a list of examples: given the same call and the
 * attachments it owns, the REAL card and the folded summary must reach the
 * same verdict. Nothing that decides an outcome is mocked here — the error
 * parser, the phase resolver and the specialized cards are the real ones; only
 * the MCP lookups, which need a server, are replaced.
 */
jest.mock('~/hooks/MCP', () => {
  const mcpServerNames: string[] = [];
  return { useMCPIconMap: () => new Map(), useMCPServerNames: () => mcpServerNames };
});

type Verdict = 'running' | 'completed' | 'failed' | 'cancelled';

type Fixture = {
  name: string;
  call: Record<string, unknown>;
  attachments?: TAttachment[];
  verdict: Verdict;
};

const HANDLE = JSON.stringify({
  background_task_id: 'bg1',
  tool: 'lookup',
  status: 'running',
  message: 'Dispatched. Poll with check_background_task.',
});

const statusAttachment = (status: string, toolCallId = 't1'): TAttachment =>
  ({
    type: 'background_task_status',
    status,
    toolCallId,
    messageId: 'm1',
  }) as unknown as TAttachment;

const memoryErrorAttachment = {
  type: Tools.memory,
  toolCallId: 't1',
  messageId: 'm1',
  [Tools.memory]: { type: 'error', key: 'diet', value: 'over the limit' },
} as unknown as TAttachment;

const FIXTURES: Fixture[] = [
  { name: 'a call still running', call: { name: 'lookup', output: '' }, verdict: 'running' },
  { name: 'a completed call', call: { name: 'lookup', output: 'rows' }, verdict: 'completed' },
  {
    name: 'a step the run closed as failed with benign output',
    call: { name: 'lookup', output: 'rows', runStepStatus: 'failed' },
    verdict: 'failed',
  },
  {
    name: 'a step the run closed as cancelled',
    call: { name: 'lookup', output: '', runStepStatus: 'cancelled' },
    verdict: 'cancelled',
  },
  {
    name: 'error-shaped output with no terminal status',
    call: { name: 'lookup', output: 'Error processing tool: connection refused' },
    verdict: 'failed',
  },
  {
    name: 'a memory tool failing in prose',
    call: { name: 'set_memory', output: 'Invalid key "x". Must be one of: diet' },
    verdict: 'failed',
  },
  {
    name: 'a memory tool failing through its error artifact',
    call: { name: 'set_memory', output: 'Memory set for key "diet"' },
    attachments: [memoryErrorAttachment],
    verdict: 'failed',
  },
  {
    name: 'a detached task that failed through its status attachment',
    call: { name: Tools.execute_code, output: HANDLE, runStepStatus: 'completed' },
    attachments: [statusAttachment('error')],
    verdict: 'failed',
  },
  {
    name: 'a detached task cancelled through its status attachment',
    call: { name: Tools.execute_code, output: HANDLE, runStepStatus: 'completed' },
    attachments: [statusAttachment('cancelled')],
    verdict: 'cancelled',
  },
  {
    name: 'a detached task carrying the cancelled flag',
    call: {
      name: Tools.execute_code,
      output: HANDLE,
      runStepStatus: 'completed',
      backgroundTask: { cancelled: true },
    },
    verdict: 'cancelled',
  },
  {
    name: 'a status attachment that belongs to a different call',
    call: { name: Tools.execute_code, output: HANDLE, runStepStatus: 'completed' },
    attachments: [statusAttachment('error', 'someone-else')],
    verdict: 'completed',
  },
];

const toPart = (call: Record<string, unknown>, id = 't1'): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id,
      args: '{}',
      type: 'tool_call',
      progress: call.output ? 1 : 0.1,
      ...call,
    },
  }) as unknown as TMessageContentParts;

const mount = (
  content: TMessageContentParts[],
  attachments: TAttachment[] | undefined,
  fold: boolean,
) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RecoilRoot>
        <ContentParts
          content={content}
          attachments={attachments}
          messageId="m1"
          conversationId="c1"
          isCreatedByUser={false}
          isLast
          isLatestMessage
          isSubmitting
          showThinking={false}
          foldLiveActivity={fold}
        />
      </RecoilRoot>
    </QueryClientProvider>,
  );

/** What the real card says, read the way a user would, in the real English
 *  strings: `ProgressText` appends "failed" on `failed`, swaps in the stop
 *  glyph on `cancelled`, and shimmers while `running`. */
const cardVerdict = (container: HTMLElement): Verdict => {
  if (/failed/i.test(container.textContent ?? '')) {
    return 'failed';
  }
  if (container.querySelector('.lucide-x') != null) {
    return 'cancelled';
  }
  return container.querySelector('.shimmer') != null ? 'running' : 'completed';
};

const foldVerdict = (): Verdict => {
  const card = screen.getByTestId('activity-phase-card');
  const outcome = within(card).queryByTestId('live-phase-outcome')?.textContent ?? '';
  if (outcome.includes('failed')) {
    return 'failed';
  }
  if (outcome.includes('cancelled')) {
    return 'cancelled';
  }
  return /^Running (?!in background)/.test(within(card).getAllByRole('button')[0].textContent ?? '')
    ? 'running'
    : 'completed';
};

describe('live fold parity with the cards it hides', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(FIXTURES)('agrees with the real card on $name', ({ call, attachments, verdict }) => {
    jest.useFakeTimers();
    const cards = mount([toPart(call)], attachments, false);
    /** A card eases its progress to completion over a few hundred ms; the
     *  verdict compared is the one it settles on, not the animation's lag. */
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(cardVerdict(cards.container)).toBe(verdict);
    cards.unmount();

    mount([toPart(call)], attachments, true);
    expect(foldVerdict()).toBe(verdict);
  });

  it('does not charge a reused provider id with what an earlier step produced', () => {
    /** Provider ids repeat across steps. The first save failed through an
     *  error artifact owned by its step; the second, with no step of its own
     *  yet, succeeded and must not inherit that artifact. */
    const earlier = toPart(
      { name: 'set_memory', output: 'Memory set for key "diet"', stepId: 's1' },
      'dup',
    );
    const later = toPart({ name: 'set_memory', output: 'Memory set for key "diet"' }, 'dup');
    const artifact = { ...memoryErrorAttachment, toolCallId: 'dup', stepId: 's1' } as TAttachment;
    mount([earlier, later], [artifact], true);
    const button = within(screen.getByTestId('activity-phase-card')).getAllByRole('button')[0];

    expect(within(button).getByTestId('live-phase-outcome')).toHaveTextContent('1 failed');
    expect(button).not.toHaveTextContent(/^Failed/);
  });

  it('leaves a running foreground subagent unfolded, then folds once it settles', () => {
    /** Its card follows the subagent progress atom, which the row cannot. */
    const running = mount([toPart({ name: 'subagent', output: '' })], undefined, true);
    expect(screen.queryByTestId('activity-phase-card')).toBeNull();
    running.unmount();

    mount([toPart({ name: 'subagent', output: 'done' })], undefined, true);
    expect(screen.getByTestId('activity-phase-card')).toBeInTheDocument();
  });

  it('treats a second call that reuses a provider id as a new line', () => {
    jest.useFakeTimers();
    const first = toPart({ name: 'lookup', args: '{"intent":"First pass"}', output: 'ok' }, 'dup');
    const second = toPart({ name: 'lookup', args: '{"intent":"Second pass"}', output: '' }, 'dup');
    const view = mount([first], undefined, true);
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <RecoilRoot>
          <ContentParts
            content={[first, second]}
            messageId="m1"
            conversationId="c1"
            isCreatedByUser={false}
            isLast
            isLatestMessage
            isSubmitting
            showThinking={false}
          />
        </RecoilRoot>
      </QueryClientProvider>,
    );
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByTestId('activity-phase-announcer')).toHaveTextContent('First pass');
  });

  it('previews CJK reasoning sentence by sentence', () => {
    const think = {
      type: ContentTypes.THINK,
      think: '两个引用共享一个提交。接下来检查顺序约定',
    } as unknown as TMessageContentParts;
    mount([toPart({ name: 'lookup', output: 'rows' }), think], undefined, true);
    const button = within(screen.getByTestId('activity-phase-card')).getAllByRole('button')[0];

    expect(button).toHaveTextContent('接下来检查顺序约定');
    expect(button).not.toHaveTextContent('两个引用');
  });

  it('keeps a CJK sentence that ends exactly at the tail instead of reverting to the call', () => {
    const think = {
      type: ContentTypes.THINK,
      think: '两个引用共享一个提交。接下来检查顺序约定。',
    } as unknown as TMessageContentParts;
    mount([toPart({ name: 'lookup', output: 'rows' }), think], undefined, true);
    const button = within(screen.getByTestId('activity-phase-card')).getAllByRole('button')[0];

    expect(button).toHaveTextContent('接下来检查顺序约定。');
  });

  it.each([
    ['still running, with no status marker yet', undefined, 'Running in background'],
    [
      'finished, once its status marker arrives',
      [statusAttachment('completed')],
      'Finished in background',
    ],
  ])('says what the real card says for a detached task %s', (_name, attachments, text) => {
    const call = { name: Tools.execute_code, output: HANDLE, runStepStatus: 'completed' };
    jest.useFakeTimers();
    const cards = mount([toPart(call)], attachments, false);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(cards.container).toHaveTextContent(text);
    cards.unmount();

    mount([toPart(call)], attachments, true);
    expect(
      within(screen.getByTestId('activity-phase-card')).getAllByRole('button')[0],
    ).toHaveTextContent(text);
  });

  it('does not re-announce a sentence when the stream pauses after a space', () => {
    jest.useFakeTimers();
    const frame = (think: string) => (
      <QueryClientProvider client={new QueryClient()}>
        <RecoilRoot>
          <ContentParts
            content={[
              toPart({ name: 'lookup', output: 'rows' }),
              { type: ContentTypes.THINK, think } as unknown as TMessageContentParts,
            ]}
            messageId="m1"
            conversationId="c1"
            isCreatedByUser={false}
            isLast
            isLatestMessage
            isSubmitting
            showThinking={false}
          />
        </RecoilRoot>
      </QueryClientProvider>
    );
    const view = render(frame('Both refs share'));
    for (const next of ['Both refs share ', 'Both refs share a', 'Both refs share a ']) {
      view.rerender(frame(next));
      act(() => {
        jest.advanceTimersByTime(500);
      });
    }

    expect(screen.getByTestId('activity-phase-announcer')).toBeEmptyDOMElement();
  });

  it('keeps an earlier failure on the row while a newer call is the line', () => {
    mount(
      [
        toPart({ name: 'lookup', output: 'rows', runStepStatus: 'failed' }, 't1'),
        toPart({ name: 'lookup', args: '{"intent":"Querying the graph', output: '' }, 't2'),
      ],
      undefined,
      true,
    );
    const button = within(screen.getByTestId('activity-phase-card')).getAllByRole('button')[0];

    expect(button).toHaveTextContent('Querying the graph');
    expect(within(button).getByTestId('live-phase-outcome')).toHaveTextContent('1 failed');
    expect(button).toHaveAccessibleName(/Querying the graph.*1 failed/);
  });

  it('announces a failure on the SAME call at once, without waiting for another source', () => {
    jest.useFakeTimers();
    const frame = (call: Record<string, unknown>) => (
      <QueryClientProvider client={new QueryClient()}>
        <RecoilRoot>
          <ContentParts
            content={[toPart(call)]}
            messageId="m1"
            conversationId="c1"
            isCreatedByUser={false}
            isLast
            isLatestMessage
            isSubmitting
            showThinking={false}
          />
        </RecoilRoot>
      </QueryClientProvider>
    );
    const view = render(frame({ name: 'lookup', output: '' }));
    const announcer = () => screen.getByTestId('activity-phase-announcer');
    expect(announcer()).toBeEmptyDOMElement();

    view.rerender(frame({ name: 'lookup', output: '', runStepStatus: 'failed' }));
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(announcer()).toHaveTextContent('1 failed');
    expect(announcer().closest('button')).toBeNull();
  });

  it('speaks the generated summary through the region that was already mounted', () => {
    const calls = [toPart({ name: 'lookup', output: 'rows' }, 't1')];
    const frame = (content: TMessageContentParts[]) => (
      <QueryClientProvider client={new QueryClient()}>
        <RecoilRoot>
          <ContentParts
            content={content}
            messageId="m1"
            conversationId="c1"
            isCreatedByUser={false}
            isLast
            isLatestMessage
            isSubmitting
            showThinking={false}
          />
        </RecoilRoot>
      </QueryClientProvider>
    );
    const view = render(frame(calls));
    const before = screen.getByTestId('activity-phase-announcer');

    view.rerender(
      frame([
        ...calls,
        {
          type: ContentTypes.ACTIVITY_LABEL,
          [ContentTypes.ACTIVITY_LABEL]: 'Fetched the rows',
          activity_label_type: 'phase',
          activity_start_index: 0,
          activity_end_index: 1,
          activity_count: 1,
          pending: false,
        } as unknown as TMessageContentParts,
      ]),
    );

    const after = screen.getByTestId('activity-phase-announcer');
    expect(after).toBe(before);
    expect(after).toHaveTextContent('Fetched the rows');
  });
});
