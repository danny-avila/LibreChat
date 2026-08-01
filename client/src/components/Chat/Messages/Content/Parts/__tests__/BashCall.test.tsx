import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import BashCall from '../BashCall';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string => {
      const translations: Record<string, string> = {
        com_ui_writing_command: 'Writing command',
        com_ui_running_command: 'Running command',
        com_ui_command_finished: 'Finished running',
        com_ui_cancelled: 'Cancelled',
        com_ui_copy_code: 'Copy code',
        com_ui_background_running: 'Running in background',
        com_ui_background_finished: 'Finished in background',
        com_ui_tool_failed: 'tool failed',
      };
      return translations[key] ?? key;
    },
  useProgress: (initialProgress: number) => initialProgress,
  useExpandCollapse: (isExpanded: boolean) => ({
    style: {
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
      opacity: isExpanded ? 1 : 0,
    },
    ref: { current: null },
  }),
}));

jest.mock('~/components/Chat/Messages/Content/ProgressText', () => ({
  __esModule: true,
  default: ({
    progress,
    inProgressText,
    finishedText,
    errorSuffix,
  }: {
    progress: number;
    inProgressText: string;
    finishedText: string;
    errorSuffix?: string;
  }) => (
    <div data-testid="progress-text">
      {progress < 1 ? inProgressText : finishedText}
      {errorSuffix != null ? ` — ${errorSuffix}` : ''}
    </div>
  ),
}));

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: ({ label }: { label?: string }) => <button type="button">{label}</button>,
}));

jest.mock('~/components/Messages/Content/LangIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="lang-icon" />,
}));

jest.mock('../Attachment', () => ({
  AttachmentGroup: () => <div data-testid="attachment-group" />,
}));

jest.mock('../useLazyHighlight', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

const renderBashCall = (args?: string | Record<string, unknown>, commandField?: string) =>
  render(
    <RecoilRoot>
      <BashCall
        initialProgress={0.1}
        isSubmitting={true}
        args={args}
        output=""
        commandField={commandField}
      />
    </RecoilRoot>,
  );

describe('BashCall status text', () => {
  it.each([undefined, '', '{"command":"sleep 10"', '{"command":"sleep 10","timeout":'])(
    'shows "Writing command" while args are missing or incomplete: %s',
    (args) => {
      renderBashCall(args);
      expect(screen.getByTestId('progress-text')).toHaveTextContent('Writing command');
      expect(screen.queryByText('Running command')).not.toBeInTheDocument();
    },
  );

  it('keeps showing "Writing command" for partial JSON even after the command field is visible', () => {
    renderBashCall('{"command":"sleep 10","incomplete":');
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Writing command');
    expect(screen.getByText(/sleep 10/)).toBeInTheDocument();
  });

  it.each(['{"command":"sleep 10"}', { command: 'sleep 10' }])(
    'shows "Running command" once command args are complete: %s',
    (args) => {
      renderBashCall(args);
      expect(screen.getByTestId('progress-text')).toHaveTextContent('Running command');
    },
  );

  it.each(['{"code":"echo hi"}', { code: 'echo hi' }])(
    'can read bash PTC code args as the command: %s',
    (args) => {
      renderBashCall(args, 'code');
      expect(screen.getByTestId('progress-text')).toHaveTextContent('Running command');
      expect(screen.getByText(/echo hi/)).toBeInTheDocument();
    },
  );
});

describe('BashCall intent label', () => {
  it('shows a streaming intent before any other arg exists (first key, partial JSON)', () => {
    renderBashCall('{"intent":"Checking the countdown ta');
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Checking the countdown ta');
    expect(screen.queryByText('Writing command')).not.toBeInTheDocument();
  });

  it('keeps the intent as the in-progress label once the command has streamed', () => {
    renderBashCall('{"intent":"Waiting for the task to settle","command":"sleep 8; echo waited"}');
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Waiting for the task to settle');
    expect(screen.queryByText('Running command')).not.toBeInTheDocument();
    expect(screen.getByText(/sleep 8/)).toBeInTheDocument();
  });

  it('keeps the intent as the settled label (completion is a UI state, not a tense change)', () => {
    render(
      <RecoilRoot>
        <BashCall
          initialProgress={1}
          isSubmitting={false}
          args={'{"intent":"Waiting for the task to settle","command":"sleep 8"}'}
          output="waited"
        />
      </RecoilRoot>,
    );
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Waiting for the task to settle');
    expect(screen.queryByText('Finished running')).not.toBeInTheDocument();
  });

  it('falls back to the generic labels when no intent is present', () => {
    renderBashCall({ command: 'sleep 10' });
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Running command');
  });

  it('ignores a non-string intent arg (a business param, not the label contract)', () => {
    renderBashCall({ intent: { nested: true }, command: 'sleep 10' });
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Running command');
  });

  it('ignores a non-string intent in complete SERIALIZED args (no String() coercion)', () => {
    renderBashCall('{"intent":{"topic":"billing"},"command":"sleep 10"}');
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Running command');
    expect(screen.queryByText(/object Object/)).not.toBeInTheDocument();
  });

  it('ignores an intent that is not the FIRST args key (label contract is first-position)', () => {
    renderBashCall('{"command":"sleep 10","intent":"billing_inquiry"}');
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Running command');
    expect(screen.queryByText('billing_inquiry')).not.toBeInTheDocument();
  });

  it('bounds a runaway intent to a single 256-char line', () => {
    const runaway = `Checking ${'a very long clause '.repeat(30)}end`;
    renderBashCall({ intent: runaway, command: 'sleep 10' });
    const text = screen.getByTestId('progress-text').textContent ?? '';
    expect(text.length).toBeLessThanOrEqual(256);
    expect(text.endsWith('…')).toBe(true);
  });

  it('never splits a surrogate pair at the truncation boundary', () => {
    const straddling = `${'x'.repeat(254)}😀 and more text to exceed the bound`;
    renderBashCall({ intent: straddling, command: 'sleep 10' });
    const text = screen.getByTestId('progress-text').textContent ?? '';
    expect(text.endsWith('x…')).toBe(true);
    expect(text).not.toContain('�');
  });

  it('decodes unicode escapes in a streaming intent (no literal \\uXXXX flash)', () => {
    renderBashCall('{"intent":"Checking caf\\u00e9 menu da');
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Checking café menu da');
  });

  it('keeps a terminal lone high surrogate once the value is settled (matches JSON.parse)', () => {
    renderBashCall('{"intent":"odd \\ud83d","command":"sleep 10"}');
    const text = screen.getByTestId('progress-text').textContent ?? '';
    expect(text).toBe('odd \ud83d');
  });
});

describe('BashCall backgrounded calls', () => {
  const HANDLE_OUTPUT = JSON.stringify({
    background_task_id: 'task-1',
    tool: 'bash_tool',
    status: 'running',
    message:
      'Started "bash_tool" in the background. Call check_background_task with background_task_id "task-1" to check progress and retrieve the result.',
  });

  const renderBackgrounded = (attachments?: Array<Record<string, unknown>>) =>
    render(
      <RecoilRoot>
        <BashCall
          initialProgress={1}
          isSubmitting={false}
          args={{ command: 'sleep 600' }}
          output={HANDLE_OUTPUT}
          attachments={attachments as never}
        />
      </RecoilRoot>,
    );

  it('shows a background-running state instead of rendering the handle JSON as stdout', () => {
    renderBackgrounded();
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Running in background');
    expect(screen.queryByText(/background_task_id/)).not.toBeInTheDocument();
  });

  it('flips to finished once attachments arrive for the call', () => {
    renderBackgrounded([{ file_id: 'f1' }]);
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Finished in background');
  });

  it('flips to finished on the status marker alone (stdout-only completion)', () => {
    renderBackgrounded([
      { type: 'background_task_status', file_id: 'bg-tc-1', toolCallId: 'tc-1' },
    ]);
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Finished in background');
    expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
  });

  it('surfaces failure when the marker carries an error status', () => {
    renderBackgrounded([
      { type: 'background_task_status', file_id: 'bg-tc-1', toolCallId: 'tc-1', status: 'error' },
    ]);
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Finished in background');
    expect(screen.getByTestId('progress-text')).toHaveTextContent('tool failed');
  });

  it('renders real stdout normally after the background result patches the output', () => {
    render(
      <RecoilRoot>
        <BashCall
          initialProgress={1}
          isSubmitting={false}
          args={{ command: 'echo hi' }}
          output="hi"
        />
      </RecoilRoot>,
    );
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Finished running');
    expect(screen.getByText('hi')).toBeInTheDocument();
  });
});
