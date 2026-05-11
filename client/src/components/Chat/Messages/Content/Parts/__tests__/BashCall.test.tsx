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
  }: {
    progress: number;
    inProgressText: string;
    finishedText: string;
  }) => <div data-testid="progress-text">{progress < 1 ? inProgressText : finishedText}</div>,
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
