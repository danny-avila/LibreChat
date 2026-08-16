import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TConversation } from 'librechat-data-provider';
import PinnedSection from '../PinnedSection';

const mockSetExpanded = jest.fn();
let mockIsExpanded = true;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useLocalStorage: () => [mockIsExpanded, mockSetExpanded],
}));

jest.mock('~/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

jest.mock('~/data-provider', () => ({
  useActiveJobs: () => ({ data: undefined }),
}));

jest.mock('../Convo', () => ({
  __esModule: true,
  default: ({ conversation }: { conversation: TConversation }) => (
    <div data-testid="pinned-convo">{conversation.title}</div>
  ),
}));

const pinnedConvo = {
  conversationId: 'pinned-1',
  title: 'Pinned Chat',
  pinned: true,
  endpoint: 'openAI',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as TConversation;

const anotherPinnedConvo = {
  ...pinnedConvo,
  conversationId: 'pinned-2',
  title: 'Another Pin',
} as TConversation;

describe('PinnedSection', () => {
  beforeEach(() => {
    mockIsExpanded = true;
    mockSetExpanded.mockReset();
  });

  it('renders nothing when there are no pinned conversations', () => {
    const { container } = render(<PinnedSection conversations={[]} toggleNav={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a collapsible Pinned header matching Chats and Projects', () => {
    render(<PinnedSection conversations={[pinnedConvo]} toggleNav={jest.fn()} />);
    const toggle = screen.getByRole('button', { name: 'com_ui_pinned' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders pinned conversations when expanded', () => {
    render(
      <PinnedSection conversations={[pinnedConvo, anotherPinnedConvo]} toggleNav={jest.fn()} />,
    );
    expect(screen.getByText('Pinned Chat')).toBeInTheDocument();
    expect(screen.getByText('Another Pin')).toBeInTheDocument();
  });

  it('hides pinned conversations when collapsed', () => {
    mockIsExpanded = false;
    render(<PinnedSection conversations={[pinnedConvo]} toggleNav={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'com_ui_pinned' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText('Pinned Chat')).not.toBeInTheDocument();
  });

  it('toggles the section when the header is clicked', () => {
    render(<PinnedSection conversations={[pinnedConvo]} toggleNav={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_pinned' }));
    expect(mockSetExpanded).toHaveBeenCalledWith(false);
  });
});
