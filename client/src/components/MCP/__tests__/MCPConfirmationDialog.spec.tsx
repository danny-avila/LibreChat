/**
 * Unit tests for the MCP confirmation queue UI behavior in the dialog.
 *
 * Covers spec §5.1:
 *   - empty queue hides the dialog
 *   - dialog renders the head only
 *   - "1 of N pending" badge appears only when queue length > 1
 *   - clicking Accept pops the head; next entry becomes visible
 *   - clicking Cancel pops the head
 *   - per-entry deadline drives the countdown for the head
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import MCPConfirmationDialog from '../MCPConfirmationDialog';
import { pendingMCPConfirmationsAtom, type MCPPendingConfirmation } from '~/store/mcpConfirmation';

// Mock the auth context — the dialog's only use of `token` is to attach as a
// Bearer header on `postDecision`'s fetch, which we mock at the global level.
jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ token: 'test-token' }),
}));

// Minimal localize stub — returns a deterministic-but-readable string that
// preserves the interpolation values so existing matchers (e.g. "1 of 3
// pending", "Confirm action: tool-A") keep working without coupling the test
// to a real i18next instance.
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) => {
    switch (key) {
      case 'com_ui_mcp_confirm_action':
        return `Confirm action: ${values?.toolName ?? ''}`;
      case 'com_ui_mcp_confirm_pending_badge':
        return `${values?.position ?? ''} of ${values?.total ?? ''} pending`;
      case 'com_ui_mcp_confirm_prompt':
        return 'The model is requesting to run a tool that requires your approval.';
      case 'com_ui_mcp_confirm_no_arguments':
        return '(no arguments)';
      case 'com_ui_mcp_confirm_auto_cancel':
        return `Auto-cancels in ${values?.seconds ?? ''}s`;
      case 'com_ui_mcp_confirm_button_accept':
        return 'Accept';
      case 'com_ui_mcp_confirm_button_cancel':
        return 'Cancel';
      case 'com_ui_mcp_confirm_show_details': {
        const c = Number(values?.count ?? 0);
        return `Show ${c} more detail${c === 1 ? '' : 's'}`;
      }
      case 'com_ui_mcp_confirm_hide_details':
        return 'Hide details';
      default:
        return key;
    }
  },
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-lite">{content}</div>,
}));

// Mock the OGDialog portal-based Radix components so jsdom doesn't have to
// deal with portals. We render children straight into the testing container
// when `open` is true; when closed/null, we render nothing.
jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    OGDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
    OGDialogContent: ({ children, className, ...props }: any) => (
      <div data-testid="dialog-root" className={className} {...props}>
        {children}
      </div>
    ),
    OGDialogHeader: ({ children, className, ...props }: any) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    OGDialogFooter: ({ children, className, ...props }: any) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    OGDialogTitle: ({ children }: any) => <h2>{children}</h2>,
    Button: ({ children, onClick, disabled, className, variant, size, type, ...props }: any) => (
      <button
        type={type ?? 'button'}
        onClick={onClick}
        disabled={disabled}
        className={className}
        data-variant={variant}
        data-size={size}
        {...props}
      >
        {children}
      </button>
    ),
  };
});

jest.mock('lucide-react', () => ({
  ChevronDown: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-down" className={className} />
  ),
  ChevronUp: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-up" className={className} />
  ),
}));

// Stable global fetch mock — we never want a test to hit the real network.
beforeEach(() => {
  (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true, status: 204 } as Response));
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makePending(overrides: Partial<MCPPendingConfirmation> = {}): MCPPendingConfirmation {
  return {
    confirmationId: 'cid-A',
    serverName: 'test-server',
    toolName: 'test-tool',
    preview: 'Tool: test-tool\n  arg: "value"',
    expiresInSeconds: 120,
    expiresAt: Date.now() + 120_000,
    deadline: Date.now() + 120_000,
    ...overrides,
  };
}

/**
 * Helper component that exposes a setter for the atom so tests can drive
 * enqueue / dedup / pop without touching internals.
 */
function QueueDriver({ initial }: { initial: MCPPendingConfirmation[] }) {
  const setQueue = useSetRecoilState(pendingMCPConfirmationsAtom);
  React.useEffect(() => {
    setQueue(initial);
    // initial is stable per render in tests; we want this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderWithQueue(initial: MCPPendingConfirmation[]) {
  return render(
    <RecoilRoot>
      <QueueDriver initial={initial} />
      <MCPConfirmationDialog />
    </RecoilRoot>,
  );
}

describe('MCPConfirmationDialog queue mechanics', () => {
  test('empty queue hides the dialog', () => {
    renderWithQueue([]);
    expect(screen.queryByTestId('dialog-root')).toBeNull();
    expect(screen.queryByText(/Confirm action/)).toBeNull();
  });

  test('renders the head only when queue has one entry', () => {
    renderWithQueue([makePending({ confirmationId: 'cid-A', toolName: 'tool-A' })]);
    expect(screen.getByText(/Confirm action: tool-A/)).toBeInTheDocument();
    // No "N pending" badge when queue length is 1.
    expect(screen.queryByText(/of \d+ pending/)).toBeNull();
  });

  test('renders only the head when queue has multiple entries; shows N-pending badge', () => {
    renderWithQueue([
      makePending({ confirmationId: 'cid-A', toolName: 'tool-A' }),
      makePending({ confirmationId: 'cid-B', toolName: 'tool-B' }),
      makePending({ confirmationId: 'cid-C', toolName: 'tool-C' }),
    ]);
    expect(screen.getByText(/Confirm action: tool-A/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirm action: tool-B/)).toBeNull();
    expect(screen.queryByText(/Confirm action: tool-C/)).toBeNull();
    expect(screen.getByText(/1 of 3 pending/)).toBeInTheDocument();
  });

  test('clicking Accept pops the head; next entry becomes visible', async () => {
    renderWithQueue([
      makePending({ confirmationId: 'cid-A', toolName: 'tool-A' }),
      makePending({ confirmationId: 'cid-B', toolName: 'tool-B' }),
    ]);
    expect(screen.getByText(/Confirm action: tool-A/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Accept'));
    });

    // After pop, head is now tool-B.
    expect(screen.queryByText(/Confirm action: tool-A/)).toBeNull();
    expect(screen.getByText(/Confirm action: tool-B/)).toBeInTheDocument();
    // Badge hides because length is now 1.
    expect(screen.queryByText(/of \d+ pending/)).toBeNull();
  });

  test('clicking Cancel pops the head', async () => {
    renderWithQueue([
      makePending({ confirmationId: 'cid-A', toolName: 'tool-A' }),
      makePending({ confirmationId: 'cid-B', toolName: 'tool-B' }),
    ]);
    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'));
    });
    expect(screen.queryByText(/Confirm action: tool-A/)).toBeNull();
    expect(screen.getByText(/Confirm action: tool-B/)).toBeInTheDocument();
  });

  test('per-entry deadline drives the countdown for the current head', () => {
    // Entry 1 (head): deadline ~60s out. Entry 2: deadline ~30s out.
    // The dialog should display ~60s — proving it reads the HEAD's deadline,
    // not some other entry's, and not a fresh full TTL of 120s.
    const now = Date.now();
    renderWithQueue([
      makePending({
        confirmationId: 'cid-A',
        toolName: 'tool-A',
        deadline: now + 60_000,
      }),
      makePending({
        confirmationId: 'cid-B',
        toolName: 'tool-B',
        deadline: now + 30_000,
      }),
    ]);
    const text = screen.getByText(/Auto-cancels in/).textContent ?? '';
    const seconds = parseInt(text.match(/(\d+)s/)?.[1] ?? '-1', 10);
    expect(seconds).toBeGreaterThanOrEqual(58);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  test('auto-cancel timer does NOT fire while an Approve is in flight (race against deadline)', async () => {
    // The bug we're guarding: at the deadline boundary, if the user has just
    // clicked Approve and the fetch is in flight, the auto-cancel timer
    // would (without the submittingRef guard) fire a competing cancel AND
    // pop the head — silently dropping the next queued entry.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(0));

    // Make fetch slow so we can observe the in-flight window.
    let resolveFetch: (value: Response) => void = () => {};
    (global as any).fetch = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    // Head has a deadline 1 second out. Second entry sits behind.
    renderWithQueue([
      makePending({
        confirmationId: 'cid-A',
        toolName: 'tool-A',
        deadline: 1_000,
      }),
      makePending({
        confirmationId: 'cid-B',
        toolName: 'tool-B',
        deadline: 60_000,
      }),
    ]);
    expect(screen.getByText(/Confirm action: tool-A/)).toBeInTheDocument();

    // User clicks Approve at the deadline boundary. fetch is now in flight.
    await act(async () => {
      fireEvent.click(screen.getByText('Accept'));
    });
    // 1 fetch call so far (the user's Approve).
    expect((global as any).fetch).toHaveBeenCalledTimes(1);

    // Advance time past the deadline. The 500ms tick fires; with the
    // submittingRef guard in place, it must SKIP the auto-cancel branch.
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    // Still 1 fetch call (no competing 'cancel' was sent).
    expect((global as any).fetch).toHaveBeenCalledTimes(1);

    // Now resolve the user's Approve. handleDecision's finally pops once.
    await act(async () => {
      resolveFetch({ ok: true, status: 204 } as Response);
    });

    // Head is now tool-B (single pop, not double). The badge stops showing
    // because length === 1.
    expect(screen.queryByText(/Confirm action: tool-A/)).toBeNull();
    expect(screen.getByText(/Confirm action: tool-B/)).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('renders markdown-format field content via MarkdownLite (not <pre>)', () => {
    const head = makePending({
      confirmationId: 'cid-md',
      toolName: 'tool-md',
      presentation: {
        title: 'Markdown test',
        fields: [
          {
            label: 'Body',
            value: '## Hello\n\nWorld',
            format: 'markdown',
            importance: 'primary',
          },
        ],
      },
    });
    renderWithQueue([head]);

    // The markdown content reaches a MarkdownLite component, not a <pre>.
    const md = screen.getByTestId('markdown-lite');
    expect(md.textContent).toBe('## Hello\n\nWorld');
  });

  test('dialog has sticky header + scrollable body + sticky footer layout classes', () => {
    renderWithQueue([makePending({ confirmationId: 'cid-A', toolName: 'tool-A' })]);

    // The body container is the only element that should scroll.
    const dialog = screen.getByTestId('dialog-root');
    expect(dialog.className).toContain('overflow-hidden');
    expect(dialog.className).toContain('flex-col');

    // Header has flex-shrink-0 + border-b
    const header = screen.getByTestId('dialog-header');
    expect(header.className).toContain('flex-shrink-0');
    expect(header.className).toContain('border-b');

    // Body is the scroll container (flex-1 + overflow-y-auto)
    const body = screen.getByTestId('dialog-body');
    expect(body.className).toContain('flex-1');
    expect(body.className).toContain('overflow-y-auto');

    // Footer is sticky at bottom
    const footer = screen.getByTestId('dialog-footer');
    expect(footer.className).toContain('flex-shrink-0');
    expect(footer.className).toContain('border-t');
  });

  test('show-details toggle is a button with chevron icon and toggles state', async () => {
    renderWithQueue([
      makePending({
        confirmationId: 'cid-d',
        toolName: 'tool-d',
        presentation: {
          title: 'Detail test',
          fields: [
            { label: 'Primary', value: 'p', format: 'text', importance: 'primary' },
            { label: 'Hidden', value: 'h', format: 'text', importance: 'detail' },
          ],
        },
      }),
    ]);

    // Initial state: details OPEN by default (chevron-up + "Hide details"
    // + detail field visible). The "open by default" choice surfaces the
    // full context of the tool call up front; the user must explicitly
    // collapse the detail panel rather than expand it.
    const collapseToggle = screen.getByRole('button', { name: /Hide details/ });
    expect(collapseToggle).toBeInTheDocument();
    expect(screen.getByTestId('chevron-up')).toBeInTheDocument();
    expect(screen.queryByTestId('chevron-down')).toBeNull();
    expect(screen.getByText(/Hidden/)).toBeInTheDocument();

    // Click → collapse
    await act(async () => {
      fireEvent.click(collapseToggle);
    });

    // After click: chevron-down + "Show 1 more detail" + detail field hidden.
    expect(
      screen.getByRole('button', { name: /Show 1 more detail/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('chevron-down')).toBeInTheDocument();
    expect(screen.queryByTestId('chevron-up')).toBeNull();
    expect(screen.queryByText(/Hidden/)).toBeNull();
  });
});
