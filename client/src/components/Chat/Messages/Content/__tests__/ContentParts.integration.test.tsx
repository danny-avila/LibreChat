import React from 'react';
import { RecoilRoot } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import ContentParts from '../ContentParts';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string | number, string>) => {
    if (key === 'com_ui_used_n_tools') {
      return `Used ${values?.[0]} tools`;
    }
    return key;
  },
  useExpandCollapse: (isExpanded: boolean) => ({
    style: { display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr' },
    ref: { current: null },
  }),
  useLazyCollapseBody: jest.requireActual('~/hooks/Messages/useLazyCollapseBody').default,
  useProgress: (initial: number) => (initial >= 1 ? 1 : initial),
  scheduleMessageContentLayoutReconcile: jest.fn(() => jest.fn()),
}));

jest.mock('~/hooks/MCP', () => {
  const mcpServerNames: string[] = [];
  return {
    useMCPIconMap: () => new Map(),
    useMCPServerNames: () => mcpServerNames,
  };
});

jest.mock('../ToolOutput', () => ({
  StackedToolIcons: () => <span data-testid="stacked-icons" />,
  getMCPServerName: () => '',
  ToolIcon: () => <span data-testid="tool-icon" />,
  getToolIconType: () => 'mcp',
  isError: () => false,
}));

jest.mock('../ToolCallInfo', () => ({
  __esModule: true,
  default: () => <div data-testid="tool-call-info" />,
}));

jest.mock('../ProgressText', () => ({
  __esModule: true,
  default: ({ onClick, finishedText }: { onClick?: () => void; finishedText?: string }) => (
    <div data-testid="progress-text" onClick={onClick}>
      {finishedText}
    </div>
  ),
}));

jest.mock('lucide-react', () => ({
  ChevronDown: () => <span>{'chevron'}</span>,
  TriangleAlert: () => <span>{'alert'}</span>,
  Users: () => <span>{'users'}</span>,
}));

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => false,
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ComponentProps<'button'> & { variant?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('../Parts', () => ({
  AttachmentGroup: ({ attachments }: { attachments?: TAttachment[] }) => (
    <div data-testid="attachment-group" data-count={attachments?.length ?? 0} />
  ),
  ExecuteCode: () => <div data-testid="execute-code" />,
  ImageGen: () => <div data-testid="image-gen" />,
  AgentUpdate: () => <div data-testid="agent-update" />,
  EmptyText: () => <div data-testid="empty-text" />,
  Reasoning: () => <div data-testid="reasoning" />,
  Summary: () => <div data-testid="summary" />,
  Text: ({ text }: { text?: string }) => <div data-testid="text">{text}</div>,
}));

jest.mock('../MemoryArtifacts', () => ({
  __esModule: true,
  default: () => <div data-testid="memory-artifacts" />,
}));

jest.mock('../WebSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="web-search" />,
}));

jest.mock('../RetrievalCall', () => ({
  __esModule: true,
  default: () => <div data-testid="retrieval-call" />,
}));

jest.mock('../AgentHandoff', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-handoff" />,
}));

jest.mock('../CodeAnalyze', () => ({
  __esModule: true,
  default: () => <div data-testid="code-analyze" />,
}));

jest.mock('../Image', () => ({
  __esModule: true,
  default: () => <div data-testid="image" />,
}));

jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('~/utils', () => {
  const actual = jest.requireActual('~/utils');
  return {
    ...actual,
    cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
    logger: { error: jest.fn() },
  };
});

const MCP_DELIMITER = '_mcp_';

const makeMcpToolCall = (
  id: string,
  hasOutput = true,
  stepId?: string,
  agentId?: string,
): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id,
      name: `getTinyImage${MCP_DELIMITER}Everything`,
      args: '{}',
      output: hasOutput ? 'image_returned' : '',
      ...(stepId == null ? {} : { stepId }),
      ...(agentId == null ? {} : { agentId }),
    },
  }) as unknown as TMessageContentParts;

const makeMcpToolCallWithoutId = (name: string, hasOutput = true): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      name: `${name}${MCP_DELIMITER}Everything`,
      args: '{}',
      output: hasOutput ? 'image_returned' : '',
    },
  }) as unknown as TMessageContentParts;

const makeTextPart = (text: string): TMessageContentParts =>
  ({ type: ContentTypes.TEXT, text }) as unknown as TMessageContentParts;

const makePhasePart = (start: number, end: number, label: string): TMessageContentParts =>
  ({
    type: ContentTypes.ACTIVITY_LABEL,
    [ContentTypes.ACTIVITY_LABEL]: label,
    activity_label_type: 'phase',
    activity_start_index: start,
    activity_end_index: end,
    activity_count: end - start,
    pending: false,
  }) as unknown as TMessageContentParts;

const imageAttachment = (toolCallId: string, name = 'tiny.png'): TAttachment =>
  ({
    filename: name,
    filepath: `/files/${name}`,
    width: 16,
    height: 16,
    messageId: 'm1',
    toolCallId,
    conversationId: 'c1',
  }) as unknown as TAttachment;

const renderContentParts = (props: React.ComponentProps<typeof ContentParts>) =>
  render(
    <RecoilRoot>
      <ContentParts {...props} />
    </RecoilRoot>,
  );

describe('ContentParts integration: MCP image hoist and grouping', () => {
  const baseProps = {
    messageId: 'msg1',
    isCreatedByUser: false,
    isLast: true,
    isSubmitting: false,
    isLatestMessage: true,
  };

  it('groups 2+ MCP tool calls and hoists their attachments outside the collapsible', () => {
    const content = [makeMcpToolCall('t1'), makeMcpToolCall('t2')];
    const attachments = [imageAttachment('t1', 'a.png'), imageAttachment('t2', 'b.png')];

    renderContentParts({
      ...baseProps,
      content,
      attachments,
    });

    const groups = screen.getAllByTestId('attachment-group');
    // One AttachmentGroup hoisted at the group level — inner ToolCalls skip rendering theirs.
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute('data-count')).toBe('2');
  });

  it('does not group a single tool call — image renders inline (no hoist)', () => {
    const content = [makeMcpToolCall('t1')];
    const attachments = [imageAttachment('t1', 'a.png')];

    renderContentParts({
      ...baseProps,
      content,
      attachments,
    });

    // Single tool call: AttachmentGroup is rendered by ToolCall, not hoisted.
    const groups = screen.queryAllByTestId('attachment-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute('data-count')).toBe('1');
    // No tool group label.
    expect(screen.queryByText(/Used .* tools/)).not.toBeInTheDocument();
  });

  it('hoists attachments from all parts in the group, even mixed image and non-image', () => {
    const fileAtt: TAttachment = {
      filename: 'doc.pdf',
      filepath: '/files/doc.pdf',
      messageId: 'm1',
      toolCallId: 't2',
      conversationId: 'c1',
    } as unknown as TAttachment;

    const content = [makeMcpToolCall('t1'), makeMcpToolCall('t2')];
    const attachments = [imageAttachment('t1', 'a.png'), fileAtt];

    renderContentParts({
      ...baseProps,
      content,
      attachments,
    });

    const groups = screen.getAllByTestId('attachment-group');
    expect(groups).toHaveLength(1);
    // Both image and file are in the hoisted group.
    expect(groups[0].getAttribute('data-count')).toBe('2');
  });

  it('renders no AttachmentGroup when grouped tool calls have no attachments', () => {
    const content = [makeMcpToolCall('t1'), makeMcpToolCall('t2')];

    renderContentParts({
      ...baseProps,
      content,
      attachments: [],
    });

    expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
  });

  it('keeps an earlier step attachment off a live repeated provider call', () => {
    const content = [
      makeMcpToolCall('call_0', true, 'step-1', 'agent_a'),
      makeMcpToolCall('call_1', true, 'step-1', 'agent_a'),
      makeTextPart('between runs'),
      makeMcpToolCall('call_0', false, undefined, 'agent_a'),
      makeMcpToolCall('call_2', false, undefined, 'agent_a'),
    ];
    const previousAttachment = {
      ...imageAttachment('call_0', 'previous.png'),
      agentId: 'agent_a',
      stepId: 'step-1',
    } as unknown as TAttachment;

    renderContentParts({ ...baseProps, content, attachments: [previousAttachment] });

    const groups = screen.getAllByTestId('attachment-group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAttribute('data-count', '1');
  });

  it('keeps a manually expanded completed tool group open when its content index shifts', () => {
    const content = [makeMcpToolCall('t1'), makeMcpToolCall('t2')];
    const nextContent = [makeTextPart('streamed preface'), ...content];

    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} content={content} />
      </RecoilRoot>,
    );

    const toggle = screen.getByRole('button', { name: 'Used 2 tools' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <RecoilRoot>
        <ContentParts {...baseProps} content={nextContent} />
      </RecoilRoot>,
    );

    expect(screen.getByRole('button', { name: 'Used 2 tools' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps repeated legacy provider-id groups independently expanded', () => {
    const content = [
      makeMcpToolCall('call_0'),
      makeMcpToolCall('call_1'),
      makeTextPart('between batches'),
      makeMcpToolCall('call_0'),
      makeMcpToolCall('call_2'),
    ];
    const nextContent = [makeTextPart('streamed preface'), ...content];
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} content={content} />
      </RecoilRoot>,
    );

    const toggles = screen.getAllByRole('button', { name: 'Used 2 tools' });
    fireEvent.click(toggles[1]);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <RecoilRoot>
        <ContentParts {...baseProps} content={nextContent} />
      </RecoilRoot>,
    );
    const shiftedToggles = screen.getAllByRole('button', { name: 'Used 2 tools' });
    expect(shiftedToggles[0]).toHaveAttribute('aria-expanded', 'false');
    expect(shiftedToggles[1]).toHaveAttribute('aria-expanded', 'true');
  });

  it('counts repeated legacy provider-id groups across activity phases', () => {
    const content = [
      makeMcpToolCall('call_0'),
      makeMcpToolCall('call_1'),
      makePhasePart(0, 2, 'First phase'),
      makeMcpToolCall('call_0'),
      makeMcpToolCall('call_2'),
      makePhasePart(3, 5, 'Second phase'),
    ];
    const shiftedContent = [
      makeTextPart('streamed preface'),
      makeMcpToolCall('call_0'),
      makeMcpToolCall('call_1'),
      makePhasePart(1, 3, 'First phase'),
      makeMcpToolCall('call_0'),
      makeMcpToolCall('call_2'),
      makePhasePart(4, 6, 'Second phase'),
    ];
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} content={content} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'First phase' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second phase' }));
    const toggles = screen.getAllByRole('button', { name: 'Used 2 tools' });
    fireEvent.click(toggles[1]);

    rerender(
      <RecoilRoot>
        <ContentParts {...baseProps} content={shiftedContent} />
      </RecoilRoot>,
    );
    for (const phase of ['First phase', 'Second phase']) {
      const phaseToggle = screen.getByRole('button', { name: phase });
      if (phaseToggle.getAttribute('aria-expanded') !== 'true') {
        fireEvent.click(phaseToggle);
      }
    }
    const shiftedToggles = screen.getAllByRole('button', { name: 'Used 2 tools' });
    expect(shiftedToggles[0]).toHaveAttribute('aria-expanded', 'false');
    expect(shiftedToggles[1]).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps a running tool group open when an individual tool is expanded before completion', () => {
    const runningContent = [makeMcpToolCall('t1', false), makeMcpToolCall('t2', false)];
    const completedContent = [
      makeMcpToolCall('t1', true, 'step-1'),
      makeMcpToolCall('t2', true, 'step-1'),
    ];

    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} isSubmitting isLatestMessage content={runningContent} />
      </RecoilRoot>,
    );

    const toggle = screen.getByRole('button', { name: 'Used 2 tools' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getAllByTestId('progress-text')[0]);

    rerender(
      <RecoilRoot>
        <ContentParts
          {...baseProps}
          isSubmitting={false}
          isLatestMessage
          content={completedContent}
        />
      </RecoilRoot>,
    );

    expect(screen.getByRole('button', { name: 'Used 2 tools' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('does not reuse fallback-index expansion state across message ids', () => {
    const content = [makeMcpToolCallWithoutId('first'), makeMcpToolCallWithoutId('second')];

    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} messageId="msg1" content={content} />
      </RecoilRoot>,
    );

    const toggle = screen.getByRole('button', { name: 'Used 2 tools' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <RecoilRoot>
        <ContentParts {...baseProps} messageId="msg2" content={content} />
      </RecoilRoot>,
    );

    expect(screen.getByRole('button', { name: 'Used 2 tools' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps id-backed expansion state across transient message id changes', () => {
    const content = [makeMcpToolCall('t1'), makeMcpToolCall('t2')];

    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} messageId="placeholder-msg" content={content} />
      </RecoilRoot>,
    );

    const toggle = screen.getByRole('button', { name: 'Used 2 tools' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <RecoilRoot>
        <ContentParts {...baseProps} messageId="server-msg" content={content} />
      </RecoilRoot>,
    );

    expect(screen.getByRole('button', { name: 'Used 2 tools' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('ContentParts — synthesized activity folds', () => {
  /** Settled by default: the fold is content-derived, so history and a live
   *  run partition identically. The streaming case gets its own test below. */
  const baseProps = {
    messageId: 'msg1',
    isCreatedByUser: false,
    isLast: true,
    isSubmitting: false,
    isLatestMessage: true,
  };

  const makeChildLabel = (label: string): TMessageContentParts =>
    ({
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: label,
      pending: false,
    }) as unknown as TMessageContentParts;

  const TICKER = 'Confirmed the fix';
  const FIRST = 'Found 43 available GitHub tools';

  const labeledRun = () => [
    makeMcpToolCall('t1'),
    makeChildLabel(FIRST),
    makeMcpToolCall('t2'),
    makeChildLabel(TICKER),
  ];

  /** The card's header and the last sub-group's header carry the same text by
   *  design — the ticker IS that sub-group's line. The card is the outer one. */
  const foldHeader = () => screen.getAllByRole('button', { name: TICKER })[0];

  it('folds a labeled run into one collapsed card headed by the newest label', () => {
    renderContentParts({ ...baseProps, content: labeledRun() });

    expect(foldHeader()).toHaveAttribute('aria-expanded', 'false');
    /** Collapsed means unmounted, so the earlier row is not merely hidden. */
    expect(screen.queryByRole('button', { name: FIRST })).toBeNull();
    expect(screen.getAllByRole('button', { name: TICKER })).toHaveLength(1);
  });

  it('reveals the sub-groups, each still collapsed, when the card is opened', () => {
    renderContentParts({ ...baseProps, content: labeledRun() });

    fireEvent.click(foldHeader());

    expect(screen.getByRole('button', { name: FIRST })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: TICKER })[1]).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('leaves the in-flight tool call outside the card', () => {
    renderContentParts({
      ...baseProps,
      isSubmitting: true,
      content: [...labeledRun(), makeMcpToolCall('t3', false)],
    });

    /** The call the reader is watching stays a sibling of the card, so it is
     *  still on screen once the fold settles shut over everything before it. */
    const panel = screen.getByTestId('activity-phase-panel');
    expect(panel.contains(screen.getByTestId('tool-call'))).toBe(false);
  });

  it('keeps the reader’s toggle when the ticker advances', () => {
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} content={labeledRun()} />
      </RecoilRoot>,
    );
    fireEvent.click(foldHeader());

    rerender(
      <RecoilRoot>
        <ContentParts
          {...baseProps}
          content={[...labeledRun(), makeMcpToolCall('t3'), makeChildLabel('Checked the callers')]}
        />
      </RecoilRoot>,
    );

    expect(screen.getAllByRole('button', { name: 'Checked the callers' })[0]).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps the reader’s toggle when a server summary replaces the ticker', () => {
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} content={labeledRun()} />
      </RecoilRoot>,
    );
    fireEvent.click(foldHeader());

    rerender(
      <RecoilRoot>
        <ContentParts
          {...baseProps}
          content={[...labeledRun(), makePhasePart(0, 4, 'Reviewed the release paths')]}
        />
      </RecoilRoot>,
    );

    expect(screen.getByRole('button', { name: 'Reviewed the release paths' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('does not replay the entrance fold when the summary replaces the ticker', () => {
    const streaming = { ...baseProps, isSubmitting: true };
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...streaming} content={labeledRun()} />
      </RecoilRoot>,
    );

    rerender(
      <RecoilRoot>
        <ContentParts
          {...streaming}
          content={[...labeledRun(), makePhasePart(0, 4, 'Reviewed the release paths')]}
        />
      </RecoilRoot>,
    );

    /** The entrance mounts a card OPEN and folds it shut over the next two
     *  painted frames. Playing it here would flash every sub-group back open
     *  on top of a card the reader already watched fold. */
    expect(screen.getByRole('button', { name: 'Reviewed the release paths' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('ticks the header forward as each sub-group resolves', () => {
    const steps = ['Read the config', 'Checked the callers', 'Confirmed the fix'];
    const content: TMessageContentParts[] = [];
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} content={[]} />
      </RecoilRoot>,
    );

    const headers: string[] = [];
    steps.forEach((step, index) => {
      content.push(makeMcpToolCall(`t${index}`), makeChildLabel(step));
      rerender(
        <RecoilRoot>
          <ContentParts {...baseProps} content={[...content]} />
        </RecoilRoot>,
      );
      const panel = screen.queryByTestId('activity-phase-panel');
      if (panel == null) {
        return;
      }
      const card = panel.parentElement?.querySelector('button');
      headers.push(card?.getAttribute('aria-label') ?? '');
      expect(card).toHaveAttribute('aria-expanded', 'false');
    });

    /** One card from the second activity on, its line always the newest —
     *  and never re-opening underneath the reader as the run advances. */
    expect(headers).toEqual(['Checked the callers', 'Confirmed the fix']);
  });

  it('refuses to fold a span holding an unresolved approval', () => {
    const awaiting = {
      type: ContentTypes.TOOL_CALL,
      [ContentTypes.TOOL_CALL]: {
        id: 't2',
        name: `getTinyImage${MCP_DELIMITER}Everything`,
        args: '{}',
        output: '',
        approval: { state: 'pending' },
      },
    } as unknown as TMessageContentParts;

    renderContentParts({
      ...baseProps,
      content: [makeMcpToolCall('t1'), makeChildLabel(FIRST), awaiting, makeChildLabel(TICKER)],
    });

    /** No card: the run is blocked on the reader, and the request must not sit
     *  behind a disclosure they have to discover. */
    expect(screen.queryByTestId('activity-phase-panel')).toBeNull();
    expect(screen.getByRole('button', { name: FIRST })).toBeInTheDocument();
  });

  it('never mounts a fold expanded while the run is live', () => {
    /** The entrance mounts a card OPEN and folds it shut. This component
     *  remounts mid-run — `messageId` is in the key and changes when the
     *  placeholder hydrates to the server id — so an entrance here would flash
     *  the whole fold back open partway through the run. */
    renderContentParts({ ...baseProps, isSubmitting: true, content: labeledRun() });

    expect(foldHeader()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: FIRST })).toBeNull();
  });

  it('keeps the toggle even when the summary claims more content than the fold', () => {
    /** The server extends a phase back across short intermediate text that the
     *  client treats as a boundary, so the two spans start in different
     *  places. They still share their first tool call, which is what the card
     *  is anchored to — so this is the same card gaining content, not a new
     *  one, and the reader's choice rides through. */
    const preface = makeTextPart('Checking now.');
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} content={[preface, ...labeledRun()]} />
      </RecoilRoot>,
    );
    fireEvent.click(foldHeader());

    rerender(
      <RecoilRoot>
        <ContentParts
          {...baseProps}
          content={[preface, ...labeledRun(), makePhasePart(0, 5, 'Reviewed the release paths')]}
        />
      </RecoilRoot>,
    );

    expect(screen.getByRole('button', { name: 'Reviewed the release paths' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('refuses to fold a span whose tool output is hoisted outside its group', () => {
    /** `ToolCallGroup` renders `groupAttachments` outside its own panel so a
     *  generated image survives collapsing the group. A fold would put that
     *  hoist back inside a disclosure. */
    renderContentParts({
      ...baseProps,
      content: labeledRun(),
      attachments: [imageAttachment('t2', 'chart.png')],
    });

    expect(screen.queryByTestId('activity-phase-panel')).toBeNull();
    expect(screen.getByRole('button', { name: FIRST })).toBeInTheDocument();
  });

  it('keeps the reader’s card open when the message takes its server id', () => {
    /** The assistant streams under a synthetic `<userId>_` for the whole run
     *  and only takes its real id at finalize. A key carrying `messageId`
     *  would remount every card at that moment and drop the toggle. */
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} content={labeledRun()} />
      </RecoilRoot>,
    );
    fireEvent.click(foldHeader());

    rerender(
      <RecoilRoot>
        <ContentParts {...baseProps} messageId="server-id" content={labeledRun()} />
      </RecoilRoot>,
    );

    expect(foldHeader()).toHaveAttribute('aria-expanded', 'true');
  });

  it('resets the card when the reader pages to another sibling', () => {
    /** `MultiMessage` reuses this instance across siblings, so a card anchored
     *  only to a content index would carry one response's open state into an
     *  unrelated one. The provider id on the span's first call separates them.
     *  No message identity can: `messageId` moves at settle too. */
    const otherSibling = [
      makeMcpToolCall('other-1'),
      makeChildLabel(FIRST),
      makeMcpToolCall('other-2'),
      makeChildLabel(TICKER),
    ];
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} siblingIdx={0} content={labeledRun()} />
      </RecoilRoot>,
    );
    fireEvent.click(foldHeader());

    rerender(
      <RecoilRoot>
        <ContentParts
          {...baseProps}
          siblingIdx={1}
          messageId="sibling-msg"
          content={otherSibling}
        />
      </RecoilRoot>,
    );

    expect(foldHeader()).toHaveAttribute('aria-expanded', 'false');
  });

  it('survives background churn that renumbers the response in place', () => {
    /** `MultiMessage` recomputes the viewed response's positional index when a
     *  sibling is added or dropped around it — dropping an optimistic row
     *  moves the newest response from index 1 to 0 while the reader stays on
     *  it. Nothing about the response changed, so neither should the card. */
    const { rerender } = render(
      <RecoilRoot>
        <ContentParts {...baseProps} siblingIdx={1} content={labeledRun()} />
      </RecoilRoot>,
    );
    fireEvent.click(foldHeader());

    rerender(
      <RecoilRoot>
        <ContentParts {...baseProps} siblingIdx={0} content={labeledRun()} />
      </RecoilRoot>,
    );

    expect(foldHeader()).toHaveAttribute('aria-expanded', 'true');
  });

  it('leaves an unlabeled run rendering exactly as before', () => {
    renderContentParts({
      ...baseProps,
      content: [makeMcpToolCall('t1'), makeMcpToolCall('t2')],
    });

    expect(screen.getByRole('button', { name: 'Used 2 tools' })).toBeInTheDocument();
    expect(screen.queryByTestId('activity-phase-panel')).toBeNull();
  });
});
