import '@testing-library/jest-dom/extend-expect';
import { Provider } from 'jotai';
import userEvent from '@testing-library/user-event';
import { Constants, Tools } from 'librechat-data-provider';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

/** A snapshot-backed branch: messages, instructions, and one tool per group,
 *  with a deferred entry on both the system and MCP families. */
const snapshotView = {
  ...view,
  usedTokens: 1000,
  maxTokens: 2000,
  percent: 50,
  isEstimate: false,
  snapshotActive: true,
  effectiveInstructionTokens: 0,
  snapshot: {
    anchorMessageId: 'message-1',
    effectiveInstructionTokens: 400,
    breakdown: {
      maxContextTokens: 2000,
      instructionTokens: 400,
      systemMessageTokens: 100,
      dynamicInstructionTokens: 20,
      toolSchemaTokens: 280,
      summaryTokens: 50,
      toolCount: 5,
      messageCount: 4,
      messageTokens: 550,
      availableForMessages: 1600,
      toolTokenCounts: {
        web_search: 90,
        deferred_tool: 30,
        [`server${Constants.mcp_delimiter}tool`]: 80,
        [`server${Constants.mcp_delimiter}lazy`]: 40,
        [Tools.skill]: 25,
        [Constants.SUBAGENT]: 15,
      },
      deferredToolNames: ['deferred_tool', `server${Constants.mcp_delimiter}lazy`],
    },
  },
} as unknown as TokenUsageView;

const renderBreakdown = (props: Partial<React.ComponentProps<typeof Breakdown>> = {}) =>
  render(
    <Provider>
      <Breakdown view={view} showCost={false} {...props} />
    </Provider>,
  );

const toggle = () => screen.getByTestId('context-breakdown-toggle');

beforeEach(() => {
  localStorage.clear();
});

describe('TokenUsage Breakdown', () => {
  describe('collapse', () => {
    it('opens showing only the gauge, with the detail behind the disclosure', () => {
      renderBreakdown();

      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByTestId('token-usage-totals')).not.toBeInTheDocument();
    });

    it('reveals the detail once expanded', async () => {
      renderBreakdown();

      await userEvent.click(toggle());

      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('token-usage-totals')).toBeInTheDocument();
    });

    it('persists the expanded choice across mounts', async () => {
      const { unmount } = renderBreakdown();
      await userEvent.click(toggle());
      unmount();

      renderBreakdown();

      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('token-usage-totals')).toBeInTheDocument();
    });

    it('keeps the gauge readout visible while collapsed', () => {
      renderBreakdown({ view: snapshotView });

      expect(within(toggle()).getByText('1K / 2K (50%)')).toBeInTheDocument();
    });
  });

  describe('segments', () => {
    it('stacks the segments in slot order, deferred beside its parent', () => {
      renderBreakdown({ view: snapshotView });

      const segments = Array.from(screen.getByRole('progressbar').children) as HTMLElement[];

      expect(
        segments.map(
          (segment) => /(?:bg-series-\d(?:\/25)?)/.exec(segment.className)?.[0] ?? 'none',
        ),
      ).toEqual([
        'bg-series-1', // messages
        'bg-series-2', // system prompt
        'bg-series-3', // system tools
        'bg-series-3', // system tools, deferred
        'bg-series-4', // mcp tools
        'bg-series-4', // mcp tools, deferred
        'bg-series-5', // skills
        'bg-series-6', // subagents
        'bg-series-7', // summary
      ]);
    });

    it('drops a category that contributes nothing', () => {
      const noSkills = JSON.parse(JSON.stringify(snapshotView)) as TokenUsageView;
      delete noSkills.snapshot?.breakdown.toolTokenCounts?.[Tools.skill];

      renderBreakdown({ view: noSkills });

      expect(screen.getByRole('progressbar').children).toHaveLength(8);
      expect(screen.getByRole('progressbar').querySelector('.bg-series-5')).toBeNull();
    });

    it('gives the deferred rows their family slot and a hatch', async () => {
      renderBreakdown({ view: snapshotView });
      await userEvent.click(toggle());

      const breakdown = screen.getByTestId('context-breakdown');
      const rowFor = (label: string) =>
        within(breakdown).getByText(label).parentElement as HTMLElement;

      const system = rowFor('com_ui_context_tools_system').firstElementChild as HTMLElement;
      const deferred = rowFor('com_ui_context_tools_system_deferred')
        .firstElementChild as HTMLElement;

      expect(system).toHaveClass('bg-series-3');
      expect(deferred).toHaveClass('bg-series-3');
      expect(system.getAttribute('style') ?? '').not.toContain('repeating-linear-gradient');
      expect(deferred.getAttribute('style')).toContain('repeating-linear-gradient');
    });

    it('renders the Messages segment solid, like every other series', async () => {
      renderBreakdown({ view: snapshotView });
      await userEvent.click(toggle());

      const messages = within(screen.getByTestId('context-breakdown')).getByText(
        'com_ui_context_messages',
      ).parentElement?.firstElementChild as HTMLElement;

      expect(messages).toHaveClass('bg-series-1');
      expect(messages.className).not.toContain('ring-series-1');
    });

    it('dims the other bar segments while a legend row is hovered', async () => {
      renderBreakdown({ view: snapshotView });
      await userEvent.click(toggle());

      const segments = Array.from(screen.getByRole('progressbar').children) as HTMLElement[];
      const rowFor = (label: string) =>
        within(screen.getByTestId('context-breakdown'))
          .getByText(label)
          .closest('div') as HTMLElement;

      fireEvent.pointerEnter(rowFor('com_ui_context_messages'));

      expect(segments[0].className).not.toContain('opacity-40');
      segments.slice(1).forEach((segment) => expect(segment).toHaveClass('opacity-40'));

      fireEvent.pointerLeave(rowFor('com_ui_context_messages'));

      segments.forEach((segment) => expect(segment.className).not.toContain('opacity-40'));
    });

    it('recedes every segment when the free track row is hovered', async () => {
      renderBreakdown({ view: snapshotView });
      await userEvent.click(toggle());

      const segments = Array.from(screen.getByRole('progressbar').children) as HTMLElement[];
      const rowFor = (label: string) =>
        within(screen.getByTestId('context-breakdown'))
          .getByText(label)
          .closest('div') as HTMLElement;

      fireEvent.pointerEnter(rowFor('com_ui_context_free'));

      segments.forEach((segment) => expect(segment).toHaveClass('opacity-40'));
    });

    it('drops the dimming when the hovered row disappears from a live update', async () => {
      const noSubagents = JSON.parse(JSON.stringify(snapshotView)) as TokenUsageView;
      delete noSubagents.snapshot?.breakdown.toolTokenCounts?.[Constants.SUBAGENT];

      const { rerender } = renderBreakdown({ view: snapshotView });
      await userEvent.click(toggle());

      const segments = () => Array.from(screen.getByRole('progressbar').children) as HTMLElement[];
      const rowFor = (label: string) =>
        within(screen.getByTestId('context-breakdown'))
          .getByText(label)
          .closest('div') as HTMLElement;

      fireEvent.pointerEnter(rowFor('com_ui_context_subagents'));
      segments().forEach((segment, index) =>
        expect(segment.classList.contains('opacity-40')).toBe(index !== 7),
      );

      rerender(
        <Provider>
          <Breakdown view={noSubagents} showCost={false} />
        </Provider>,
      );

      segments().forEach((segment) => expect(segment.className).not.toContain('opacity-40'));

      /** The hover state is cleared, not masked: the row reappearing on a later
       *  live update must not bring the stale dimming back. */
      rerender(
        <Provider>
          <Breakdown view={snapshotView} showCost={false} />
        </Provider>,
      );

      segments().forEach((segment) => expect(segment.className).not.toContain('opacity-40'));
    });

    it('leaves the estimate path unsegmented, with no swatches on its rows', async () => {
      renderBreakdown();
      await userEvent.click(toggle());

      const estimate = screen.getByTestId('context-estimate');

      expect(estimate).toBeInTheDocument();
      expect(estimate.querySelector('[class*="bg-series-"]')).toBeNull();
    });
  });

  describe('totals', () => {
    it('labels the usage section so the numbers are not read as context', async () => {
      renderBreakdown();
      await userEvent.click(toggle());

      expect(
        within(screen.getByTestId('token-usage-totals')).getByRole('heading', {
          name: 'com_ui_context_totals',
        }),
      ).toBeInTheDocument();
    });
  });

  describe('langfuse', () => {
    const url = 'https://cloud.langfuse.com/project/project-1/sessions/conversation-1';

    it('renders the Langfuse session as an external link when available', async () => {
      renderBreakdown({ langfuseSessionUrl: url });
      await userEvent.click(toggle());

      expect(screen.getByRole('link', { name: 'com_ui_langfuse_view_session' })).toHaveAttribute(
        'href',
        url,
      );
      expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
    });

    it('omits the Langfuse session link when no traced message is available', async () => {
      renderBreakdown();
      await userEvent.click(toggle());

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });
});
