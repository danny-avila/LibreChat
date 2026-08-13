import '@testing-library/jest-dom/extend-expect';
import { render, screen } from '@testing-library/react';
import type { TokenUsageView } from '~/hooks/Chat/useTokenUsage';
import Breakdown from './Breakdown';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const view = {
  usedTokens: 10,
  percent: 0,
  isEstimate: true,
  snapshot: null,
  snapshotActive: false,
  branchTotals: {
    input: 10,
    output: 0,
    counted: 1,
    total: 1,
    estTokens: 0,
    tailEstTokens: 0,
    containsAnchor: false,
    summaryBaseline: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, costKnown: true },
    tailId: null,
  },
  branchUsage: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, costKnown: true },
  totalUsage: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, costKnown: true },
  hasUsage: true,
  branchCost: 0,
  totalCost: 0,
  liveTokens: 0,
  estimatedTokens: 0,
  overheadTokens: 0,
  messageTokens: 10,
  messagesPruned: false,
} as TokenUsageView;

describe('TokenUsage Breakdown', () => {
  it('renders the Langfuse session as an external link when available', () => {
    const url = 'https://cloud.langfuse.com/project/project-1/sessions/conversation-1';

    render(<Breakdown view={view} showCost={false} langfuseSessionUrl={url} />);

    expect(screen.getByRole('link', { name: 'com_ui_langfuse_view_session' })).toHaveAttribute(
      'href',
      url,
    );
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('omits the Langfuse session link when no traced message is available', () => {
    render(<Breakdown view={view} showCost={false} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
