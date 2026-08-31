import React from 'react';
import { RecoilRoot } from 'recoil';
import { Tools, Constants, ContentTypes } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import { scheduleMessageContentLayoutReconcile } from '~/hooks';
import ToolCallGroup from '../ToolCallGroup';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string | number, string>) => {
    if (key === 'com_ui_used_n_tools') {
      return `Used ${values?.[0]} tools`;
    }
    if (key === 'com_ui_asked_n_questions') {
      return `Asked ${values?.[0]} questions`;
    }
    if (key === 'com_ui_asking_n_questions') {
      return `Asking ${values?.[0]} questions`;
    }
    if (key === 'com_ui_via_server') {
      return `via ${values?.[0]}`;
    }
    return key;
  },
  useExpandCollapse: (isExpanded: boolean) => ({
    style: {
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
    },
    ref: { current: null },
  }),
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
  StackedToolIcons: ({ toolNames }: { toolNames: string[] }) => (
    <span data-testid="stacked-icons" data-tool-names={toolNames.join(',')} />
  ),
  getMCPServerName: () => '',
}));

jest.mock('lucide-react', () => ({
  ChevronDown: () => <span>{'chevron'}</span>,
  Users: () => <span>{'users'}</span>,
  MessageCircleQuestion: () => <span data-testid="question-icon">{'question'}</span>,
}));

jest.mock('~/utils/approval', () => ({
  ASK_USER_QUESTION: 'ask_user_question',
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  getToolDisplayLabel: (name: string) =>
    ['execute_code', 'bash_tool', 'run_tools_with_code', 'run_tools_with_bash'].includes(name)
      ? 'Code'
      : name,
  /** Real implementations: the group header resolves its text through these,
   *  so stubbing them out would hide the header logic under test. */
  getBatchActivityLabelPart: jest.requireActual('~/utils/activityLabels').getBatchActivityLabelPart,
  getActivityLabelText: jest.requireActual('~/utils/activityLabels').getActivityLabelText,
  hasPendingApprovalInPart: jest.requireActual('~/utils/groupToolCalls').hasPendingApprovalInPart,
}));

jest.mock('../Parts', () => ({
  AttachmentGroup: ({ attachments }: { attachments?: TAttachment[] }) => (
    <div data-testid="attachment-group" data-count={attachments?.length ?? 0} />
  ),
}));

const makePart = (
  id: string,
  output = 'done',
  name = 'fetch_image',
  args: string | Record<string, unknown> = '{}',
): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id,
      name,
      args,
      output,
    },
  }) as unknown as TMessageContentParts;

const makeApprovalPart = (id: string, output = ''): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id,
      name: 'approval_probe',
      args: {},
      output,
      approval: {
        actionId: 'action-1',
        allowed_decisions: ['approve', 'reject'],
      },
    },
  }) as unknown as TMessageContentParts;

const makeSubagentPart = (
  id: string,
  subagentContent: TMessageContentParts[],
): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id,
      name: Constants.SUBAGENT,
      args: {},
      output: '',
      subagent_content: subagentContent,
    },
  }) as unknown as TMessageContentParts;

const imageAttachment: TAttachment = {
  filename: 'foo.png',
  filepath: '/files/foo.png',
  width: 128,
  height: 128,
  messageId: 'm1',
  toolCallId: 't1',
  conversationId: 'c1',
} as unknown as TAttachment;

const fileAttachment: TAttachment = {
  filename: 'bar.pdf',
  filepath: '/files/bar.pdf',
  messageId: 'm1',
  toolCallId: 't2',
  conversationId: 'c1',
} as unknown as TAttachment;

const renderGroup = (props: React.ComponentProps<typeof ToolCallGroup>) =>
  render(
    <RecoilRoot>
      <ToolCallGroup {...props} />
    </RecoilRoot>,
  );

const mockScheduleMessageContentLayoutReconcile =
  scheduleMessageContentLayoutReconcile as jest.Mock;

describe('ToolCallGroup image hoisting', () => {
  const parts = [
    { part: makePart('t1'), idx: 0 },
    { part: makePart('t2'), idx: 1 },
  ];

  const baseProps = {
    parts,
    isSubmitting: false,
    isLast: false,
    lastContentIdx: 1,
    renderPart: (_p: TMessageContentParts, idx: number) => (
      <div data-testid={`inner-${idx}`} key={idx}>
        {'inner'}
      </div>
    ),
  } satisfies React.ComponentProps<typeof ToolCallGroup>;

  beforeEach(() => {
    mockScheduleMessageContentLayoutReconcile.mockClear();
  });

  it('renders an AttachmentGroup outside the collapsible container with all attachments', () => {
    renderGroup({
      ...baseProps,
      groupAttachments: [imageAttachment, fileAttachment],
    });

    const group = screen.getByTestId('attachment-group');
    expect(group).toBeInTheDocument();
    expect(group.getAttribute('data-count')).toBe('2');
  });

  it('hoists non-image attachments so they survive collapse', () => {
    renderGroup({
      ...baseProps,
      groupAttachments: [fileAttachment],
    });

    const group = screen.getByTestId('attachment-group');
    expect(group).toBeInTheDocument();
    expect(group.getAttribute('data-count')).toBe('1');
  });

  it('does not render an AttachmentGroup when there are no group attachments', () => {
    renderGroup(baseProps);
    expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
  });

  it('does not reconcile layout for an initially collapsed completed group', () => {
    renderGroup(baseProps);
    expect(mockScheduleMessageContentLayoutReconcile).not.toHaveBeenCalled();
  });

  /** A settled label proves the batch finished — a void tool's legitimate
   *  empty output must not keep its labeled group expanded forever. */
  it('auto-collapses a labeled group whose only tool returned an empty output', () => {
    const voidToolParts = [{ part: makePart('t1', '', 'update_settings'), idx: 0 }];
    const labelPart = {
      part: {
        type: ContentTypes.ACTIVITY_LABEL,
        [ContentTypes.ACTIVITY_LABEL]: 'Updated the notification settings',
        pending: false,
      } as unknown as TMessageContentParts,
      idx: 1,
    };

    renderGroup({
      ...baseProps,
      parts: voidToolParts,
      lastContentIdx: 1,
      labelPart,
    });

    expect(
      screen.getByRole('button', { name: 'Updated the notification settings' }),
    ).toBeInTheDocument();
    /** Collapsed: bodies not mounted. */
    expect(screen.queryByTestId('inner-0')).not.toBeInTheDocument();
  });

  it('keeps a pending-label group expanded while its tool has no output', () => {
    const voidToolParts = [{ part: makePart('t1', '', 'update_settings'), idx: 0 }];
    const labelPart = {
      part: {
        type: ContentTypes.ACTIVITY_LABEL,
        [ContentTypes.ACTIVITY_LABEL]: '',
        pending: true,
      } as unknown as TMessageContentParts,
      idx: 1,
    };

    renderGroup({
      ...baseProps,
      parts: voidToolParts,
      lastContentIdx: 1,
      labelPart,
      isSubmitting: true,
    });

    expect(screen.getByTestId('inner-0')).toBeInTheDocument();
  });

  /** A remount into a completed phase card must not flash open and collapse
   *  again while the parent entrance fold is playing — the phase summary
   *  already speaks for this activity. */
  it('mounts collapsed inside a completed phase even while a tool is still active', () => {
    const voidToolParts = [{ part: makePart('t1', '', 'update_settings'), idx: 0 }];
    const labelPart = {
      part: {
        type: ContentTypes.ACTIVITY_LABEL,
        [ContentTypes.ACTIVITY_LABEL]: '',
        pending: true,
      } as unknown as TMessageContentParts,
      idx: 1,
    };

    renderGroup({
      ...baseProps,
      parts: voidToolParts,
      lastContentIdx: 1,
      labelPart,
      isSubmitting: true,
      withinActivityPhase: true,
    });

    expect(screen.queryByTestId('inner-0')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  /** A phase can resolve while an approval inside it still blocks the run
   *  (see ActivityPhaseGroup's pending-approval retention) — the remounted
   *  group must keep the actionable card mounted, not bury it behind a
   *  second collapsed disclosure. */
  it('keeps a pending approval expanded inside a completed phase', () => {
    renderGroup({
      ...baseProps,
      parts: [
        { part: makeApprovalPart('t1'), idx: 0 },
        { part: makeApprovalPart('t2'), idx: 1 },
      ],
      isSubmitting: true,
      withinActivityPhase: true,
    });

    expect(screen.getByRole('button', { name: 'Used 2 tools' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('inner-0')).toBeInTheDocument();
    expect(screen.getByTestId('inner-1')).toBeInTheDocument();
  });

  it('still expands on user toggle inside a completed phase', () => {
    renderGroup({ ...baseProps, withinActivityPhase: true });

    fireEvent.click(screen.getByRole('button', { name: 'Used 2 tools' }));

    expect(screen.getByTestId('inner-0')).toBeInTheDocument();
    expect(screen.getByTestId('inner-1')).toBeInTheDocument();
  });

  it('does not render tool bodies for an initially collapsed large completed group', () => {
    const largeParts = Array.from({ length: 59 }, (_, idx) => ({
      part: makePart(`t${idx}`),
      idx,
    }));
    const renderPart = jest.fn((_p: TMessageContentParts, idx: number) => (
      <div data-testid={`inner-${idx}`} key={idx}>
        {'inner'}
      </div>
    ));

    renderGroup({
      ...baseProps,
      parts: largeParts,
      lastContentIdx: largeParts.length - 1,
      renderPart,
    });

    expect(screen.getByRole('button', { name: 'Used 59 tools' })).toBeInTheDocument();
    expect(renderPart).not.toHaveBeenCalled();
    expect(screen.queryByTestId('inner-0')).not.toBeInTheDocument();
  });

  it('mounts tool bodies when a collapsed group is expanded', () => {
    renderGroup(baseProps);

    fireEvent.click(screen.getByRole('button', { name: 'Used 2 tools' }));

    expect(screen.getByTestId('inner-0')).toBeInTheDocument();
    expect(screen.getByTestId('inner-1')).toBeInTheDocument();
  });

  it('unmounts tool bodies after a collapsed group finishes transitioning', () => {
    renderGroup(baseProps);

    const button = screen.getByRole('button', { name: 'Used 2 tools' });
    const collapsible = button.nextElementSibling as HTMLElement;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByTestId('inner-0')).toBeInTheDocument();

    fireEvent.transitionEnd(collapsible);

    expect(screen.queryByTestId('inner-0')).not.toBeInTheDocument();
  });

  it('keeps unresolved approval bodies mounted while the group is collapsed', () => {
    const approvalParts = [
      { part: makeApprovalPart('t1'), idx: 0 },
      { part: makeApprovalPart('t2'), idx: 1 },
    ];
    renderGroup({
      ...baseProps,
      parts: approvalParts,
      renderPart: (_p: TMessageContentParts, idx: number) => (
        <div data-testid={`approval-${idx}`} key={idx}>
          {'approval'}
        </div>
      ),
    });

    const button = screen.getByRole('button', { name: 'Used 2 tools' });
    const collapsible = button.nextElementSibling as HTMLElement;
    expect(screen.getByTestId('approval-0')).toBeInTheDocument();

    fireEvent.click(button);
    fireEvent.transitionEnd(collapsible);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('approval-0')).toBeInTheDocument();
    expect(screen.getByTestId('approval-1')).toBeInTheDocument();
  });

  it('keeps deeply nested unresolved approval bodies mounted while the group is collapsed', () => {
    const nestedApprovalParts = [
      {
        part: makeSubagentPart('parent', [
          makeSubagentPart('child', [makeApprovalPart('grandchild')]),
        ]),
        idx: 0,
      },
      { part: makePart('sibling'), idx: 1 },
    ];
    renderGroup({
      ...baseProps,
      parts: nestedApprovalParts,
      renderPart: (_p: TMessageContentParts, idx: number) => (
        <div data-testid={`nested-${idx}`} key={idx}>
          {'nested'}
        </div>
      ),
    });

    const button = screen.getByRole('button', { name: 'Used 2 tools' });
    const collapsible = button.nextElementSibling as HTMLElement;
    fireEvent.click(button);
    fireEvent.transitionEnd(collapsible);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('nested-0')).toBeInTheDocument();
    expect(screen.getByTestId('nested-1')).toBeInTheDocument();
  });

  it('does not retain a collapsed group for an already resolved nested approval', () => {
    const nestedApprovalParts = [
      {
        part: makeSubagentPart('parent', [
          makeSubagentPart('child', [makeApprovalPart('grandchild', 'done')]),
        ]),
        idx: 0,
      },
      { part: makePart('sibling'), idx: 1 },
    ];
    renderGroup({
      ...baseProps,
      parts: nestedApprovalParts,
      renderPart: (_p: TMessageContentParts, idx: number) => (
        <div data-testid={`resolved-nested-${idx}`} key={idx}>
          {'nested'}
        </div>
      ),
    });

    const button = screen.getByRole('button', { name: 'Used 2 tools' });
    const collapsible = button.nextElementSibling as HTMLElement;
    fireEvent.click(button);
    fireEvent.transitionEnd(collapsible);

    expect(screen.queryByTestId('resolved-nested-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resolved-nested-1')).not.toBeInTheDocument();
  });

  it('unmounts retained approval bodies after every approval in a collapsed group resolves', async () => {
    const renderPart = (_p: TMessageContentParts, idx: number) => (
      <div data-testid={`retained-${idx}`} key={idx}>
        {'approval'}
      </div>
    );
    const propsFor = (
      firstOutput = '',
      secondOutput = '',
    ): React.ComponentProps<typeof ToolCallGroup> => ({
      ...baseProps,
      parts: [
        { part: makeApprovalPart('t1', firstOutput), idx: 0 },
        { part: makeApprovalPart('t2', secondOutput), idx: 1 },
      ],
      renderPart,
    });
    const { rerender } = renderGroup(propsFor());

    const button = screen.getByRole('button', { name: 'Used 2 tools' });
    const collapsible = button.nextElementSibling as HTMLElement;
    fireEvent.click(button);
    fireEvent.transitionEnd(collapsible);
    expect(screen.getByTestId('retained-0')).toBeInTheDocument();

    rerender(
      <RecoilRoot>
        <ToolCallGroup {...propsFor('first done')} />
      </RecoilRoot>,
    );
    expect(screen.getByTestId('retained-0')).toBeInTheDocument();
    expect(screen.getByTestId('retained-1')).toBeInTheDocument();

    rerender(
      <RecoilRoot>
        <ToolCallGroup {...propsFor('first done', 'second done')} />
      </RecoilRoot>,
    );
    await waitFor(() => {
      expect(screen.queryByTestId('retained-0')).not.toBeInTheDocument();
      expect(screen.queryByTestId('retained-1')).not.toBeInTheDocument();
    });
  });

  it('waits for an active collapse transition before unmounting resolved approval bodies', () => {
    const renderPart = (_p: TMessageContentParts, idx: number) => (
      <div data-testid={`transitioning-${idx}`} key={idx}>
        {'approval'}
      </div>
    );
    const propsFor = (output = ''): React.ComponentProps<typeof ToolCallGroup> => ({
      ...baseProps,
      parts: [
        { part: makeApprovalPart('t1', output), idx: 0 },
        { part: makeApprovalPart('t2', output), idx: 1 },
      ],
      renderPart,
    });
    const { rerender } = renderGroup(propsFor());

    const button = screen.getByRole('button', { name: 'Used 2 tools' });
    const collapsible = button.nextElementSibling as HTMLElement;
    fireEvent.click(button);

    rerender(
      <RecoilRoot>
        <ToolCallGroup {...propsFor('done')} />
      </RecoilRoot>,
    );
    expect(screen.getByTestId('transitioning-0')).toBeInTheDocument();
    expect(screen.getByTestId('transitioning-1')).toBeInTheDocument();

    fireEvent.transitionEnd(collapsible);
    expect(screen.queryByTestId('transitioning-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transitioning-1')).not.toBeInTheDocument();
  });

  it('reconciles layout after the group collapses from an expanded state', async () => {
    renderGroup(baseProps);

    fireEvent.click(screen.getByRole('button', { name: 'Used 2 tools' }));
    expect(mockScheduleMessageContentLayoutReconcile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Used 2 tools' }));

    await waitFor(() => {
      expect(mockScheduleMessageContentLayoutReconcile).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the image AttachmentGroup as a sibling of the collapsible panel, not a child', () => {
    const { container } = renderGroup({
      ...baseProps,
      groupAttachments: [imageAttachment],
    });

    const outer = container.firstChild as HTMLElement;
    const attachmentGroup = screen.getByTestId('attachment-group');
    expect(attachmentGroup.parentElement).toBe(outer);

    const collapsible = outer.querySelector('[style]');
    expect(collapsible?.contains(attachmentGroup)).toBe(false);
  });

  it('summarizes mixed bash PTC and bash_tool calls as one Code tool family', () => {
    renderGroup({
      ...baseProps,
      parts: [
        {
          part: makePart('t1', 'ptc done', Constants.PROGRAMMATIC_TOOL_CALLING, {
            code: 'echo via ptc',
          }),
          idx: 0,
        },
        {
          part: makePart('t2', 'bash done', Tools.bash_tool, {
            command: 'echo via bash',
          }),
          idx: 1,
        },
      ],
    });

    expect(screen.getByText('· Code')).toBeInTheDocument();
    expect(screen.queryByText(/Code, bash_tool/)).not.toBeInTheDocument();
    expect(screen.getByTestId('stacked-icons')).toHaveAttribute(
      'data-tool-names',
      'bash_tool,bash_tool',
    );
  });

  it('labels a homogeneous ask_user_question group as its own category', () => {
    renderGroup({
      ...baseProps,
      parts: [
        { part: makePart('q1', 'blue', 'ask_user_question'), idx: 0 },
        { part: makePart('q2', 'staging', 'ask_user_question'), idx: 1 },
      ],
    });

    // Own verb, not "Used N tools"; question glyph instead of stacked wrenches;
    // raw-name summary suppressed (like subagent groups).
    expect(screen.getByRole('button', { name: 'Asked 2 questions' })).toBeInTheDocument();
    expect(screen.queryByText('Used 2 tools')).not.toBeInTheDocument();
    expect(screen.getByTestId('question-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('stacked-icons')).not.toBeInTheDocument();
    expect(screen.queryByText(/· ask_user_question/)).not.toBeInTheDocument();
  });

  it('uses the present tense while a multi-question turn is still streaming', () => {
    renderGroup({
      ...baseProps,
      isSubmitting: true,
      parts: [
        { part: makePart('q1', 'blue', 'ask_user_question'), idx: 0 },
        // Second question not yet answered (no output) — turn still in flight.
        { part: makePart('q2', '', 'ask_user_question'), idx: 1 },
      ],
    });

    expect(screen.getByRole('button', { name: 'Asking 2 questions' })).toBeInTheDocument();
  });

  it('keeps the generic "Used N tools" label for a mixed group containing a question', () => {
    renderGroup({
      ...baseProps,
      parts: [
        { part: makePart('t1', 'result', 'web_search'), idx: 0 },
        { part: makePart('q1', 'blue', 'ask_user_question'), idx: 1 },
      ],
    });

    expect(screen.getByRole('button', { name: 'Used 2 tools' })).toBeInTheDocument();
    expect(screen.getByTestId('stacked-icons')).toBeInTheDocument();
  });
});
