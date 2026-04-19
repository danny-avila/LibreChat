import React from 'react';
import { render, screen } from '@testing-library/react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';

jest.mock('~/utils', () => ({
  mapAttachments: () => ({}),
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
}));

jest.mock('../MemoryArtifacts', () => ({
  __esModule: true,
  default: () => <div data-testid="memory-artifacts" />,
}));

jest.mock('../Parts/SkillCall', () => ({
  __esModule: true,
  default: ({ args, initialProgress }: { args: string; initialProgress: number }) => (
    <div data-testid="skill-call" data-args={args} data-progress={initialProgress} />
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
  ParallelContentRenderer: () => <div data-testid="parallel-renderer" />,
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
  it('renders a SkillCall per manual skill on assistant messages', () => {
    render(<ContentParts {...baseProps} manualSkills={['brand-guidelines', 'pptx']} />);
    const cards = screen.getAllByTestId('skill-call');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute(
      'data-args',
      JSON.stringify({ skillName: 'brand-guidelines' }),
    );
    expect(cards[1]).toHaveAttribute('data-args', JSON.stringify({ skillName: 'pptx' }));
  });

  it('renders SkillCall with progress < 1 (pending/running state)', () => {
    render(<ContentParts {...baseProps} manualSkills={['pptx']} />);
    const card = screen.getByTestId('skill-call');
    expect(Number(card.getAttribute('data-progress'))).toBeLessThan(1);
  });

  it('does NOT render skill cards on user messages', () => {
    render(<ContentParts {...baseProps} isCreatedByUser manualSkills={['pptx']} />);
    expect(screen.queryByTestId('skill-call')).toBeNull();
  });

  it('renders nothing (no crash) when manualSkills is empty and content is undefined', () => {
    const { container } = render(
      <ContentParts {...baseProps} content={undefined} manualSkills={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders pending skill cards even when content is undefined', () => {
    render(<ContentParts {...baseProps} content={undefined} manualSkills={['pptx']} />);
    expect(screen.getAllByTestId('skill-call')).toHaveLength(1);
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
    const skillCard = screen.getByTestId('skill-call');
    const parallelRenderer = screen.getByTestId('parallel-renderer');
    expect(skillCard).toBeTruthy();
    expect(parallelRenderer).toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING: skillCard precedes parallelRenderer in DOM order.
    // Ordering matters: interim cards anchor to the top of the message (matching where
    // the backend's real prime parts land at finalize via `contentParts.unshift`).
    expect(skillCard.compareDocumentPosition(parallelRenderer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('renders pending skill cards above sequential content', () => {
    const sequentialContent: TMessageContentParts[] = [
      { type: ContentTypes.TEXT, text: 'streamed' } as unknown as TMessageContentParts,
    ];
    render(<ContentParts {...baseProps} content={sequentialContent} manualSkills={['pptx']} />);
    const skillCard = screen.getByTestId('skill-call');
    const textPart = screen.getByTestId(`real-part-${ContentTypes.TEXT}`);
    expect(skillCard).toBeTruthy();
    expect(textPart).toBeTruthy();
    expect(skillCard.compareDocumentPosition(textPart)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
