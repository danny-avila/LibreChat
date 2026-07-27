import React from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import type { TMessageContentParts } from 'librechat-data-provider';

jest.mock('~/utils', () => ({
  mapAttachments: () => ({}),
  filterAttachmentsForPart: (attachments: unknown) => attachments,
  groupSequentialToolCalls: (parts: Array<{ part: unknown; idx: number }>) =>
    parts.map((p) => ({ type: 'single' as const, part: p })),
}));

jest.mock('~/Providers', () => ({
  MessageContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  SearchContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}));

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
  default: () => <div data-testid="tool-call-group" />,
}));

jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
}));

jest.mock('../Part', () => ({
  __esModule: true,
  default: ({ part }: { part: TMessageContentParts }) => (
    <div data-testid={`real-part-${part.type}`} />
  ),
}));

jest.mock('../ParallelContent', () => ({
  /** Invokes `renderResumeAttribution` per content index like the real
   *  renderer does for its sequential stretches, so the wiring is testable. */
  ParallelContentRenderer: ({
    content,
    renderResumeAttribution,
  }: {
    content?: Array<TMessageContentParts | undefined>;
    renderResumeAttribution?: (idx: number) => React.ReactNode;
  }) => (
    <div data-testid="parallel-renderer">
      {content?.map((_, idx) => renderResumeAttribution?.(idx))}
    </div>
  ),
}));

jest.mock('../Parts/PendingSteers', () => ({
  __esModule: true,
  default: () => <div data-testid="pending-steers" />,
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
});

/* The pending block belongs to the reply being written: shown under every
   message, or after the run has ended, it reads as unsent words piling up. */
describe('ContentParts — pending steers', () => {
  const withGate = (over: Partial<typeof baseProps> & { conversationId?: string }) =>
    render(<ContentParts {...baseProps} {...over} />);

  it('shows them on the last message while a run is live', () => {
    withGate({ isLast: true, isSubmitting: true, conversationId: 'convo-1' });
    expect(screen.getByTestId('pending-steers')).toBeInTheDocument();
  });

  it.each([
    ['an earlier message', { isLast: false, isSubmitting: true, conversationId: 'convo-1' }],
    ['a finished run', { isLast: true, isSubmitting: false, conversationId: 'convo-1' }],
    ['no conversation yet', { isLast: true, isSubmitting: true, conversationId: undefined }],
  ])('shows nothing for %s', (_label, over) => {
    withGate(over);
    expect(screen.queryByTestId('pending-steers')).not.toBeInTheDocument();
  });
});
