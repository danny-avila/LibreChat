import React from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TMessageContentParts } from 'librechat-data-provider';
import { groupSequentialToolCalls } from '~/utils';

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  mapAttachments: () => ({}),
  filterAttachmentsForPart: (attachments: unknown) => attachments,
  groupSequentialToolCalls: jest.fn(),
}));

jest.mock('~/Providers', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    MessageContext: {
      Provider: ({
        children,
        value,
      }: {
        children: React.ReactElement<{ idx?: number }>;
        value: { partIndex: number };
      }) => react.cloneElement(children, { idx: value.partIndex }),
    },
    SearchContext: {
      Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
  };
});

jest.mock('../Parts', () => ({
  EditTextPart: () => <div data-testid="edit-text-part" />,
  EmptyText: () => <div data-testid="empty-text" />,
  AgentUpdate: ({ currentAgentId }: { currentAgentId: string }) => (
    <div data-testid="post-steer-agent-update" data-agent-id={currentAgentId} />
  ),
}));

jest.mock('../MemoryArtifacts', () => ({
  __esModule: true,
  default: () => <div data-testid="memory-artifacts" />,
}));

jest.mock('../Parts/PendingSkillCall', () => ({
  __esModule: true,
  default: ({ skillName, loaded }: { skillName: string; loaded: boolean }) => (
    <div data-testid="pending-skill-call" data-skill={skillName} data-loaded={String(loaded)} />
  ),
}));

jest.mock('../ToolCallGroup', () => ({
  __esModule: true,
  default: ({
    initialExpansionState,
    onExpansionChange,
  }: {
    initialExpansionState?: { isExpanded: boolean; userOverride: boolean };
    onExpansionChange?: (state: { isExpanded: boolean; userOverride: boolean }) => void;
  }) => (
    <button
      data-testid="tool-call-group"
      data-initial-expanded={
        initialExpansionState == null ? 'unset' : String(initialExpansionState.isExpanded)
      }
      onClick={() => onExpansionChange?.({ isExpanded: false, userOverride: true })}
    />
  ),
}));

jest.mock('../ActivityPhaseGroup', () => ({
  __esModule: true,
  default: ({ children, showCursor }: { children: React.ReactNode; showCursor?: boolean }) => (
    <div data-testid="activity-phase-group" data-show-cursor={String(showCursor === true)}>
      {children}
    </div>
  ),
}));

jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
}));

jest.mock('../Part', () => ({
  __esModule: true,
  default: ({ part, idx }: { part: TMessageContentParts; idx: number }) => (
    <div data-testid={`real-part-${part.type}`} data-index={idx} />
  ),
}));

jest.mock('../ParallelContent', () => ({
  /** Invokes `renderResumeAttribution` per content index like the real
   *  renderer does for its sequential stretches, so the wiring is testable. */
  ParallelContentRenderer: ({
    content,
    contentIndexOffset = 0,
    renderResumeAttribution,
  }: {
    content?: Array<TMessageContentParts | undefined>;
    contentIndexOffset?: number;
    renderResumeAttribution?: (idx: number) => React.ReactNode;
  }) => (
    <div data-testid="parallel-renderer" data-index-offset={contentIndexOffset}>
      {content?.map((_, idx) => renderResumeAttribution?.(idx + contentIndexOffset))}
    </div>
  ),
}));

import ContentParts from '../ContentParts';

const baseProps = {
  messageId: 'msg-1',
  isLast: false,
  isSubmitting: false,
  isLatestMessage: false,
  isCreatedByUser: false,
  content: [],
};

beforeEach(() => {
  jest
    .mocked(groupSequentialToolCalls)
    .mockImplementation((parts) => parts.map((part) => ({ type: 'single', part })));
});

describe('ContentParts — interim skill cards', () => {
  it('renders a PendingSkillCall per manual skill on assistant messages', () => {
    render(<ContentParts {...baseProps} manualSkills={['brand-guidelines', 'pptx']} />);
    const cards = screen.getAllByTestId('pending-skill-call');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('data-skill', 'brand-guidelines');
    expect(cards[1]).toHaveAttribute('data-skill', 'pptx');
  });

  it('starts pending skill cards in the not-loaded state (no real content yet)', () => {
    render(<ContentParts {...baseProps} manualSkills={['pptx']} />);
    expect(screen.getByTestId('pending-skill-call')).toHaveAttribute('data-loaded', 'false');
  });

  it('flips pending cards to loaded once any real content part arrives', () => {
    const content: TMessageContentParts[] = [
      { type: ContentTypes.TEXT, text: 'streamed' } as unknown as TMessageContentParts,
    ];
    render(<ContentParts {...baseProps} content={content} manualSkills={['pptx']} />);
    expect(screen.getByTestId('pending-skill-call')).toHaveAttribute('data-loaded', 'true');
  });

  it('does NOT render skill cards on user messages', () => {
    render(<ContentParts {...baseProps} isCreatedByUser manualSkills={['pptx']} />);
    expect(screen.queryByTestId('pending-skill-call')).toBeNull();
  });

  it('renders nothing when manualSkills is empty and content is undefined', () => {
    const { container } = render(
      <ContentParts {...baseProps} content={undefined} manualSkills={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders pending skill cards even when content is undefined', () => {
    render(<ContentParts {...baseProps} content={undefined} manualSkills={['pptx']} />);
    expect(screen.getAllByTestId('pending-skill-call')).toHaveLength(1);
  });

  it('renders pending skill cards above parallel content', () => {
    const parallelContent: TMessageContentParts[] = [
      {
        type: ContentTypes.TEXT,
        text: 'parallel',
        groupId: 'group-1',
      } as unknown as TMessageContentParts,
    ];
    render(<ContentParts {...baseProps} content={parallelContent} manualSkills={['pptx']} />);
    const skillCard = screen.getByTestId('pending-skill-call');
    const parallelRenderer = screen.getByTestId('parallel-renderer');
    expect(skillCard).toBeTruthy();
    expect(parallelRenderer).toBeTruthy();
    expect(skillCard.compareDocumentPosition(parallelRenderer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('renders pending skill cards above sequential content', () => {
    const sequentialContent: TMessageContentParts[] = [
      { type: ContentTypes.TEXT, text: 'streamed' } as unknown as TMessageContentParts,
    ];
    render(<ContentParts {...baseProps} content={sequentialContent} manualSkills={['pptx']} />);
    const skillCard = screen.getByTestId('pending-skill-call');
    const textPart = screen.getByTestId(`real-part-${ContentTypes.TEXT}`);
    expect(skillCard).toBeTruthy();
    expect(textPart).toBeTruthy();
    expect(skillCard.compareDocumentPosition(textPart)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe('ContentParts — post-steer author re-attribution', () => {
  const steerPart = {
    type: ContentTypes.STEER,
    steer: 'go left',
  } as unknown as TMessageContentParts;
  const textPart = (text: string) =>
    ({ type: ContentTypes.TEXT, text }) as unknown as TMessageContentParts;
  const header = <div data-testid="author-header" />;

  it('re-renders the author header between a steer and the content that resumes after it', () => {
    render(
      <ContentParts
        {...baseProps}
        content={[textPart('a'), steerPart, textPart('b')]}
        authorHeader={header}
      />,
    );
    const headers = screen.getAllByTestId('author-header');
    expect(headers).toHaveLength(1);
    const steer = screen.getByTestId(`real-part-${ContentTypes.STEER}`);
    const textParts = screen.getAllByTestId(`real-part-${ContentTypes.TEXT}`);
    expect(steer.compareDocumentPosition(headers[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(headers[0].compareDocumentPosition(textParts[1])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders one header per steer block and none after a trailing steer', () => {
    render(
      <ContentParts
        {...baseProps}
        content={[textPart('a'), steerPart, steerPart, textPart('b'), steerPart]}
        authorHeader={header}
      />,
    );
    expect(screen.getAllByTestId('author-header')).toHaveLength(1);
  });

  it('skips empty content slots when finding the part that resumes after a steer', () => {
    render(
      <ContentParts
        {...baseProps}
        content={[steerPart, undefined, textPart('b')]}
        authorHeader={header}
      />,
    );
    expect(screen.getAllByTestId('author-header')).toHaveLength(1);
  });

  it('renders no header when authorHeader is not provided', () => {
    render(<ContentParts {...baseProps} content={[textPart('a'), steerPart, textPart('b')]} />);
    expect(screen.queryByTestId('author-header')).toBeNull();
  });

  it('re-attributes to the ACTIVE agent when a handoff preceded the steer', () => {
    const agentUpdate = {
      type: ContentTypes.AGENT_UPDATE,
      [ContentTypes.AGENT_UPDATE]: { agentId: 'agent_b', index: 1 },
    } as unknown as TMessageContentParts;
    render(
      <ContentParts
        {...baseProps}
        content={[textPart('a'), agentUpdate, textPart('b'), steerPart, textPart('c')]}
        authorHeader={header}
      />,
    );
    const marker = screen.getAllByTestId('post-steer-agent-update');
    expect(marker).toHaveLength(1);
    expect(marker[0]).toHaveAttribute('data-agent-id', 'agent_b');
    expect(screen.queryByTestId('author-header')).toBeNull();
  });

  it('provides resume attribution to the parallel renderer for its sequential stretches', () => {
    const parallelText = {
      type: ContentTypes.TEXT,
      text: 'column',
      groupId: 1,
    } as unknown as TMessageContentParts;
    render(
      <ContentParts
        {...baseProps}
        content={[parallelText, steerPart, textPart('resumed')]}
        authorHeader={header}
      />,
    );
    const renderer = screen.getByTestId('parallel-renderer');
    expect(renderer).toBeTruthy();
    expect(screen.getAllByTestId('author-header')).toHaveLength(1);
  });

  it('keeps the top-level header when the handoff comes AFTER the steer', () => {
    const agentUpdate = {
      type: ContentTypes.AGENT_UPDATE,
      [ContentTypes.AGENT_UPDATE]: { agentId: 'agent_b', index: 2 },
    } as unknown as TMessageContentParts;
    render(
      <ContentParts
        {...baseProps}
        content={[textPart('a'), steerPart, agentUpdate, textPart('b')]}
        authorHeader={header}
      />,
    );
    expect(screen.getAllByTestId('author-header')).toHaveLength(1);
    expect(screen.queryByTestId('post-steer-agent-update')).toBeNull();
  });

  it('retains steer attribution when resumed content moves into a phase slice', () => {
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: 'Reconciled both release paths',
      activity_label_type: 'phase',
      activity_start_index: 2,
      activity_count: 2,
      pending: false,
    } as unknown as TMessageContentParts;
    render(
      <ContentParts
        {...baseProps}
        content={[textPart('a'), steerPart, textPart('resumed'), phase]}
        authorHeader={header}
      />,
    );

    expect(screen.getByTestId('activity-phase-group')).toBeTruthy();
    expect(screen.getAllByTestId('author-header')).toHaveLength(1);
    expect(screen.getAllByTestId(`real-part-${ContentTypes.TEXT}`)[1]).toHaveAttribute(
      'data-index',
      '2',
    );
  });
});

describe('ContentParts — activity phase state', () => {
  it('keeps a streaming cursor when a completed phase marker is the visible tail', () => {
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: 'Compared both search results',
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_count: 2,
      pending: false,
    } as unknown as TMessageContentParts;

    render(
      <ContentParts
        {...baseProps}
        content={[
          { type: ContentTypes.TEXT, text: 'working' } as unknown as TMessageContentParts,
          phase,
        ]}
        isLast
        isSubmitting
        isLatestMessage
      />,
    );

    expect(screen.getByTestId('activity-phase-group')).toHaveAttribute('data-show-cursor', 'true');
  });

  it('carries the absolute index offset into a parallel phase segment', () => {
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: 'Compared both agent results',
      activity_label_type: 'phase',
      activity_start_index: 1,
      activity_count: 2,
      pending: false,
    } as unknown as TMessageContentParts;
    const parallel = {
      type: ContentTypes.TEXT,
      text: 'lane result',
      groupId: 1,
    } as unknown as TMessageContentParts;

    render(
      <ContentParts
        {...baseProps}
        content={[
          { type: ContentTypes.TEXT, text: 'before' } as unknown as TMessageContentParts,
          parallel,
          phase,
        ]}
      />,
    );

    expect(screen.getByTestId('parallel-renderer')).toHaveAttribute('data-index-offset', '1');
  });

  it('retains a tool-group expansion override when a completed phase remounts the group', () => {
    jest.mocked(groupSequentialToolCalls).mockImplementation((parts) => {
      const toolParts = parts.filter(({ part }) => part.type === ContentTypes.TOOL_CALL);
      if (toolParts.length > 0) {
        return [{ type: 'tool-group', parts: toolParts }];
      }
      return parts.map((part) => ({ type: 'single', part }));
    });
    const tools = [
      {
        type: ContentTypes.TOOL_CALL,
        [ContentTypes.TOOL_CALL]: { id: 'tool-1', name: 'search', args: {}, output: 'one' },
      },
      {
        type: ContentTypes.TOOL_CALL,
        [ContentTypes.TOOL_CALL]: { id: 'tool-2', name: 'search', args: {}, output: 'two' },
      },
    ] as unknown as TMessageContentParts[];
    const pendingPhase = {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: '',
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_count: 2,
      pending: true,
    } as unknown as TMessageContentParts;
    const { rerender } = render(<ContentParts {...baseProps} content={[...tools, pendingPhase]} />);

    const pendingGroup = screen.getByTestId('tool-call-group');
    expect(pendingGroup).toHaveAttribute('data-initial-expanded', 'unset');
    fireEvent.click(pendingGroup);

    const completedPhase = {
      ...pendingPhase,
      [ContentTypes.ACTIVITY_LABEL]: 'Compared both search results',
      pending: false,
    } as unknown as TMessageContentParts;
    rerender(<ContentParts {...baseProps} content={[...tools, completedPhase]} />);

    expect(screen.getByTestId('activity-phase-group')).toBeInTheDocument();
    expect(screen.getByTestId('tool-call-group')).toHaveAttribute('data-initial-expanded', 'false');
  });
});
