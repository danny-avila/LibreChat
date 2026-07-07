import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { SubagentRun } from '~/store/subagents';
import SubagentPanel from '../SubagentPanel';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, values?: Record<string, unknown>): string => {
      const arg0 = (values?.[0] as string | undefined) ?? '';
      const translations: Record<string, string> = {
        com_ui_agent: 'Agent',
        com_ui_close: 'Close',
        com_ui_copy_to_clipboard: 'Copy',
        com_ui_copied_to_clipboard: 'Copied',
        com_ui_subagent_status_running: 'Running',
        com_ui_subagent_status_done: 'Done',
        com_ui_subagent_status_stopped: 'Stopped',
        com_ui_subagent_status_failed: 'Failed',
        com_ui_subagent_tool_count: `${arg0} tools`,
        com_ui_subagent_thought_count: `${arg0} thoughts`,
        com_ui_subagent_scroll_to_bottom: 'Scroll to latest',
      };
      return translations[key] ?? key;
    },
}));

jest.mock('@librechat/client', () => ({
  __esModule: true,
  Button: ({ children, onClick, 'aria-label': ariaLabel }: any) => (
    <button type="button" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  useMediaQuery: () => false,
}));

jest.mock('copy-to-clipboard', () => ({ __esModule: true, default: jest.fn() }));

jest.mock('~/components/Share/MessageIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="agent-icon" />,
}));

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: ({ onClick, label }: { onClick: () => void; label?: string }) => (
    <button type="button" onClick={onClick} aria-label={label} data-testid="copy-btn" />
  ),
}));

jest.mock('lucide-react', () => ({
  ArrowDown: () => <span data-testid="icon-down" />,
  Users: () => <span data-testid="icon-users" />,
  X: () => <span data-testid="icon-x" />,
}));

jest.mock('~/components/Chat/Messages/Content/Parts/SubagentBody', () => ({
  __esModule: true,
  SubagentBody: ({ contentParts }: { contentParts: unknown[] }) => (
    <div data-testid="subagent-body" data-parts={contentParts.length} />
  ),
  SubagentPrompt: ({ prompt }: { prompt: string }) => (
    <div data-testid="subagent-prompt">{prompt}</div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/Parts', () => ({
  AttachmentGroup: () => <div data-testid="attachment-group" />,
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => ({}),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

/** Reports the focused-run atom so tests can assert the close action. */
function RunIdProbe() {
  const runId = useRecoilValue(store.currentSubagentRunId);
  return <div data-testid="run-id">{runId ?? ''}</div>;
}

function renderPanel(run: SubagentRun) {
  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.subagentRunsState, { [run.toolCallId]: run });
        set(store.currentSubagentRunId, run.toolCallId);
      }}
    >
      <RunIdProbe />
      <SubagentPanel />
    </RecoilRoot>,
  );
}

const persistedContent = [
  { type: 'think', think: 'thinking' },
  { type: 'tool_call', tool_call: { id: 'c1', name: 'search', output: 'x', progress: 1 } },
  { type: 'text', text: 'The final answer.' },
] as unknown as TMessageContentParts[];

describe('SubagentPanel', () => {
  it('renders the header, a Done status, derived counts, body, and prompt footer for a finished run', async () => {
    renderPanel({
      toolCallId: 'panel_run',
      args: { subagent_type: 'researcher', prompt: 'Investigate the topic' },
      output: 'The final answer.',
      initialProgress: 1,
      persistedContent,
    });

    await waitFor(() => {
      expect(screen.getByText('researcher')).toBeInTheDocument();
    });
    expect(screen.getByText('Done')).toBeInTheDocument();
    // subtitle: 1 tool · 1 thought derived from the parts
    expect(screen.getByText(/1 tools/)).toBeInTheDocument();
    expect(screen.getByText(/1 thoughts/)).toBeInTheDocument();
    expect(screen.getByTestId('subagent-body')).toHaveAttribute('data-parts', '3');
    expect(screen.getByTestId('subagent-prompt')).toHaveTextContent('Investigate the topic');
  });

  it('closes the panel (clears currentSubagentRunId) when the close button is clicked', async () => {
    renderPanel({
      toolCallId: 'panel_close',
      args: { subagent_type: 'self' },
      output: 'done',
      initialProgress: 1,
      persistedContent: [{ type: 'text', text: 'done' }] as unknown as TMessageContentParts[],
    });

    await waitFor(() => {
      expect(screen.getByTestId('run-id')).toHaveTextContent('panel_close');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('run-id')).toHaveTextContent('');
  });

  it('omits the prompt footer when the run has no prompt', async () => {
    renderPanel({
      toolCallId: 'panel_noprompt',
      args: { subagent_type: 'self' },
      output: 'done',
      initialProgress: 1,
      persistedContent: [{ type: 'text', text: 'done' }] as unknown as TMessageContentParts[],
    });

    await waitFor(() => {
      expect(screen.getByTestId('subagent-body')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('subagent-prompt')).not.toBeInTheDocument();
    // self-spawn with no agent name → the localized "Agent" title
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });
});
