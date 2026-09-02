import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import TokenUsage from './index';

const mockCompaction = {
  compact: jest.fn(),
  canCompact: false,
  isCompacting: true,
};

jest.mock('~/hooks/Chat/useCompactConversation', () => ({
  __esModule: true,
  default: () => mockCompaction,
  supportsCompaction: () => true,
}));

jest.mock('~/hooks/Chat/useTokenUsage', () => ({
  __esModule: true,
  default: () => ({
    usedTokens: 100,
    maxTokens: 1000,
    percent: 10,
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data: {
      interface: { contextUsage: true },
      compactionEnabled: true,
      langfuseConnectionAccess: false,
    },
  }),
  useGetLangfuseSessionLinkQuery: () => ({ data: undefined }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('./Breakdown', () => ({
  __esModule: true,
  default: () => <div data-testid="context-breakdown" />,
}));

jest.mock('./CompactAction', () => ({
  __esModule: true,
  default: () => <div data-testid="compact-action" />,
}));

const conversation = {
  conversationId: 'conversation-1',
  endpoint: 'openAI',
} as TConversation;

describe('TokenUsage compacting indicator', () => {
  it('shows the spinner only while the Context popover is closed', async () => {
    render(<TokenUsage index={0} conversation={conversation} isSubmitting={false} />);

    const disclosure = screen.getByTestId('token-usage');
    expect(disclosure).toHaveAttribute('aria-busy', 'true');
    expect(disclosure).toHaveAttribute('aria-label', 'com_ui_context_compaction_requested');
    expect(disclosure.querySelector('.spinner')).toBeInTheDocument();
    expect(disclosure.querySelector('[role="meter"]')).not.toBeInTheDocument();

    fireEvent.click(disclosure);

    await waitFor(() => expect(screen.getByTestId('compact-action')).toBeInTheDocument());
    expect(disclosure.querySelector('.spinner')).not.toBeInTheDocument();
    expect(disclosure.querySelector('[role="meter"]')).toBeInTheDocument();
  });
});
