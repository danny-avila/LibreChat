import React from 'react';
import { RecoilRoot, useRecoilCallback } from 'recoil';
import { render, screen, act } from '@testing-library/react';
import SubagentCall from '../SubagentCall';
import { subagentProgressByToolCallId, type SubagentProgress } from '~/store/subagents';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) => {
    const type = (values?.[0] as string | undefined) ?? '';
    const translations: Record<string, string> = {
      com_ui_subagent_running: `Subagent "${type}" is working…`,
      com_ui_subagent_complete: `Subagent "${type}" finished`,
      com_ui_subagent_cancelled: `Subagent "${type}" cancelled`,
      com_ui_subagent_errored: `Subagent "${type}" errored`,
      com_ui_subagent_waiting: 'Waiting for first update…',
      com_ui_subagent_dialog_title: `Subagent: ${type}`,
      com_ui_subagent_dialog_description: 'Isolated child run.',
      com_ui_subagent_activity_log: 'Activity log',
      com_ui_subagent_no_result_yet: 'No result yet.',
      com_ui_subagent_empty_result: 'No text.',
    };
    return translations[key] ?? key;
  },
}));

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

jest.mock('../Attachment', () => ({
  AttachmentGroup: ({ attachments }: { attachments: unknown }) => (
    <div data-testid="attachment-group">{JSON.stringify(attachments)}</div>
  ),
}));

jest.mock('@librechat/client', () => ({
  OGDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-title">{children}</div>
  ),
  OGDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-description">{children}</div>
  ),
}));

jest.mock('lucide-react', () => ({
  // eslint-disable-next-line i18next/no-literal-string
  ChevronRight: () => <span>chevron</span>,
  // eslint-disable-next-line i18next/no-literal-string
  Users: () => <span>users</span>,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

/**
 * Mount the component inside a RecoilRoot and expose a setter so each test
 * can seed the `subagentProgressByToolCallId` atom with the state under test.
 * Real Recoil, no mocks of the store — matches the hook-integration test
 * style in useStepHandler.spec.ts.
 */
function renderWithState(args: {
  toolCallId: string;
  initialProgress: number;
  isSubmitting?: boolean;
  progress?: SubagentProgress | null;
}) {
  const setter = { current: null as null | ((next: SubagentProgress | null) => void) };
  const SeedHelper = () => {
    setter.current = useRecoilCallback(
      ({ set }) =>
        (next: SubagentProgress | null) => {
          set(subagentProgressByToolCallId(args.toolCallId), next);
        },
      [],
    );
    return null;
  };
  const rendered = render(
    <RecoilRoot>
      <SeedHelper />
      <SubagentCall
        toolCallId={args.toolCallId}
        initialProgress={args.initialProgress}
        isSubmitting={args.isSubmitting ?? false}
        args={{ subagent_type: 'self', description: 'compute' }}
      />
    </RecoilRoot>,
  );
  act(() => {
    setter.current?.(args.progress ?? null);
  });
  return rendered;
}

describe('SubagentCall — status resolution', () => {
  it('renders "working…" while streaming and no terminal envelope has arrived', () => {
    renderWithState({
      toolCallId: 'call_running',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'run_step',
      },
    });
    expect(screen.getByText('Subagent "self" is working…')).toBeInTheDocument();
  });

  it('renders "finished" when the subagent emits a `stop` phase', () => {
    renderWithState({
      toolCallId: 'call_stopped',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'stop',
      },
    });
    expect(screen.getByText('Subagent "self" finished')).toBeInTheDocument();
  });

  it('renders "finished" when the tool call progress reaches 1', () => {
    renderWithState({
      toolCallId: 'call_done',
      initialProgress: 1,
      isSubmitting: false,
      progress: null,
    });
    expect(screen.getByText('Subagent "self" finished')).toBeInTheDocument();
  });

  it('renders "cancelled" when the stream stops before a terminal envelope (Codex P2 regression)', () => {
    /**
     * Codex P2 on #12725: the old `running` computation ignored whether the
     * parent run was still streaming, so a user stop or dropped connection
     * would leave the ticker permanently "working…". Mirror the behavior
     * of `ToolCall.tsx` — `!isSubmitting && !finished` → cancelled.
     */
    renderWithState({
      toolCallId: 'call_cancelled',
      initialProgress: 0.4,
      isSubmitting: false,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'run_step',
      },
    });
    expect(screen.getByText('Subagent "self" cancelled')).toBeInTheDocument();
  });

  it('renders "errored" when the subagent emits an `error` phase', () => {
    renderWithState({
      toolCallId: 'call_error',
      initialProgress: 0.4,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'error',
      },
    });
    expect(screen.getByText('Subagent "self" errored')).toBeInTheDocument();
  });
});
