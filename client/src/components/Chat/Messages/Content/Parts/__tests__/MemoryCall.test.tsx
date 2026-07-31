import React from 'react';
import { render, screen } from '@testing-library/react';
import MemoryCall from '../MemoryCall';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string => {
      const translations: Record<string, string> = {
        com_ui_memory_saving: 'Saving memory',
        com_ui_memory_saved: 'Saved memory',
        com_ui_memory_deleting: 'Deleting memory',
        com_ui_memory_removed: 'Deleted memory',
        com_ui_memory_deleted: 'Memory deleted',
        com_ui_cancelled: 'Cancelled',
        com_ui_tool_failed: 'failed',
      };
      return translations[key] ?? key;
    },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/components/Chat/Messages/Content/ProgressText', () => ({
  __esModule: true,
  default: ({
    progress,
    inProgressText,
    finishedText,
    subtitle,
    errorSuffix,
    hasInput,
  }: {
    progress: number;
    inProgressText: string;
    finishedText: string;
    subtitle?: string;
    errorSuffix?: string;
    hasInput?: boolean;
  }) => (
    <div data-testid="progress-text" data-has-input={String(!!hasInput)}>
      {progress < 1 ? inProgressText : finishedText}
      {subtitle ? ` ${subtitle}` : ''}
      {errorSuffix ? ` ${errorSuffix}` : ''}
    </div>
  ),
}));

jest.mock('../Attachment', () => ({
  AttachmentGroup: () => <div data-testid="attachment-group" />,
}));

jest.mock('../useToolCallState', () => ({
  __esModule: true,
  default: (initialProgress: number, _isSubmitting: boolean, output: string) => ({
    showCode: true,
    toggleCode: jest.fn(),
    expandStyle: {},
    expandRef: { current: null },
    progress: initialProgress,
    cancelled: false,
    hasError: output.startsWith('Error'),
    hasOutput: output.length > 0,
    hasContent: true,
  }),
}));

describe('MemoryCall', () => {
  it('labels a completed save with the memory key and shows the value', () => {
    render(
      <MemoryCall
        toolName="set_memory"
        initialProgress={1}
        isSubmitting={false}
        args={{ key: 'preferences', value: 'Prefers dark mode.' }}
        output="Memory saved."
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Saved memory preferences');
    expect(screen.getByText('preferences')).toHaveClass('font-bold', 'uppercase');
    expect(screen.getByText('Prefers dark mode.')).toBeInTheDocument();
    expect(screen.queryByText('Memory saved.')).not.toBeInTheDocument();
  });

  it('labels an in-flight save without a parsed key', () => {
    render(
      <MemoryCall
        toolName="set_memory"
        initialProgress={0.5}
        isSubmitting={true}
        args={'{"ke'}
        output=""
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Saving memory');
    expect(screen.getByTestId('progress-text')).toHaveAttribute('data-has-input', 'false');
  });

  it('renders a delete as the key with a deletion note', () => {
    render(
      <MemoryCall
        toolName="delete_memory"
        initialProgress={1}
        isSubmitting={false}
        args={{ key: 'outdated_note' }}
        output="Memory deleted."
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Deleted memory outdated_note');
    expect(screen.getByText('outdated_note')).toHaveClass('font-bold', 'uppercase');
    expect(screen.getByText('Memory deleted')).toBeInTheDocument();
  });

  it('surfaces the error output inside the panel', () => {
    render(
      <MemoryCall
        toolName="set_memory"
        initialProgress={1}
        isSubmitting={false}
        args={{ key: 'preferences', value: 'value' }}
        output="Error: memory storage full"
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('failed');
    expect(screen.getByText('Error: memory storage full')).toBeInTheDocument();
  });
});
