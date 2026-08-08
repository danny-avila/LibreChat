import React from 'react';
import { RecoilRoot } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import AgentHandoff from '../AgentHandoff';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_transferred_to: 'Transferred to',
      com_ui_agent: 'Agent',
      com_ui_handoff_instructions: 'Handoff instructions',
      com_ui_copy_to_clipboard: 'Copy to clipboard',
      com_ui_copied_to_clipboard: 'Copied to clipboard',
    };
    return translations[key] || key;
  },
  useExpandCollapse: (isExpanded: boolean) => ({
    style: {
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
      opacity: isExpanded ? 1 : 0,
    },
    ref: { current: null },
  }),
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => ({
    'agent-123': { name: 'Test Agent' },
  }),
}));

jest.mock('~/components/Share/MessageIcon', () => ({
  __esModule: true,
  default: () => <div data-testid="message-icon" />,
}));

jest.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron-down" />,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '),
}));

const renderAgentHandoff = (props: {
  name: string;
  args: string | Record<string, unknown>;
  output?: string | null;
}) =>
  render(
    <RecoilRoot>
      <AgentHandoff {...props} />
    </RecoilRoot>,
  );

describe('AgentHandoff', () => {
  it('A11Y-01: renders a semantic button element when hasInfo is true', () => {
    renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: '{"key":"value"}',
    });

    const button = screen.getByRole('button', { name: /Transferred to/i });
    expect(button.tagName).toBe('BUTTON');
  });

  it('A11Y-02: button has aria-label describing the handoff target', () => {
    renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: '{"key":"value"}',
    });

    const button = screen.getByRole('button', { name: /Transferred to/i });
    expect(button).toHaveAttribute('aria-label');
    expect(button.getAttribute('aria-label')).toContain('Transferred to');
    expect(button.getAttribute('aria-label')).toContain('Test Agent');
  });

  it('A11Y-03: button has focus-visible ring classes', () => {
    renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: '{"key":"value"}',
    });

    const button = screen.getByRole('button', { name: /Transferred to/i });
    expect(button.className).toContain('focus-visible:ring-2');
  });

  it('A11Y-04: disabled button is rendered when hasInfo is false', () => {
    renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: '',
    });

    const button = screen.getByRole('button', { name: /Transferred to/i });
    expect(button).toBeDisabled();
  });

  it('renders the handoff instruction as prose instead of JSON', () => {
    const { container } = renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: JSON.stringify({
        instructions: 'Review the rollout, validate retention, and report blockers.',
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Transferred to/i }));

    expect(
      screen.getByText('Review the rollout, validate retention, and report blockers.'),
    ).toBeInTheDocument();
    expect(container.querySelector('pre')).not.toBeInTheDocument();
    expect(screen.queryByText(/"instructions"/)).not.toBeInTheDocument();
  });

  it('copies the readable instruction rather than its JSON wrapper', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: JSON.stringify({ instructions: 'Review the rollout.' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Transferred to/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));

    expect(writeText).toHaveBeenCalledWith('Review the rollout.');
    expect(await screen.findByRole('button', { name: 'Copied to clipboard' })).toBeInTheDocument();
  });

  it('supports object args and a custom handoff prompt key', () => {
    renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: { work_items: 'Verify the migration plan.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Transferred to/i }));

    expect(screen.getByText('Verify the migration plan.')).toBeInTheDocument();
    expect(screen.queryByText('Work items')).not.toBeInTheDocument();
  });

  it('labels each value when a legacy handoff contains multiple fields', () => {
    renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: JSON.stringify({
        work_items: 'Verify the migration plan.',
        priority: 'High',
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Transferred to/i }));

    expect(screen.getByText('Work items')).toBeInTheDocument();
    expect(screen.getByText('Verify the migration plan.')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders a partially streamed instruction without exposing JSON syntax', () => {
    renderAgentHandoff({
      name: 'lc_transfer_to_agent-123',
      args: '{"instructions":"Review the rollout and report',
    });

    fireEvent.click(screen.getByRole('button', { name: /Transferred to/i }));

    expect(screen.getByText('Review the rollout and report')).toBeInTheDocument();
    expect(screen.queryByText(/"instructions"/)).not.toBeInTheDocument();
  });
});
