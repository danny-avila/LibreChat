import React from 'react';
import { render, screen } from '@testing-library/react';
import FileAuthoringCall from '../FileAuthoringCall';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, values?: Record<string | number, string>): string => {
      const translations: Record<string, string> = {
        com_ui_created_file: 'Created {{0}}',
        com_ui_creating_file: 'Creating {{0}}',
        com_ui_edited_file: 'Edited {{0}}',
        com_ui_editing_file: 'Editing {{0}}',
        com_ui_cancelled: 'Cancelled',
        com_ui_tool_failed: 'failed',
      };
      return (translations[key] ?? key).replace('{{0}}', values?.[0] ?? '');
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
  }: {
    progress: number;
    inProgressText: string;
    finishedText: string;
  }) => <div data-testid="progress-text">{progress < 1 ? inProgressText : finishedText}</div>,
}));

jest.mock('../CodeWindowHeader', () => ({
  __esModule: true,
  default: ({ language }: { language: string }) => (
    <div data-testid="code-window-header" data-language={language} />
  ),
}));

jest.mock('../Attachment', () => ({
  AttachmentGroup: () => <div data-testid="attachment-group" />,
}));

jest.mock('../useLazyHighlight', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../useToolCallState', () => ({
  __esModule: true,
  default: (initialProgress: number) => ({
    showCode: true,
    toggleCode: jest.fn(),
    expandStyle: {},
    expandRef: { current: null },
    progress: initialProgress,
    cancelled: false,
    hasError: false,
  }),
}));

describe('FileAuthoringCall', () => {
  it('shows create_file content args while the call is in progress', () => {
    render(
      <FileAuthoringCall
        toolName="create_file"
        initialProgress={0.5}
        isSubmitting={true}
        args={{
          file_path: 'skills/demo/SKILL.md',
          content: '# Demo\n\nUse this skill for testing.',
        }}
        output=""
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Creating SKILL.md');
    expect(screen.getByTestId('code-window-header')).toHaveAttribute('data-language', 'SKILL.md');
    expect(screen.getByText(/Use this skill for testing/)).toBeInTheDocument();
  });

  it('shows completed create_file output instead of full content args', () => {
    render(
      <FileAuthoringCall
        toolName="create_file"
        initialProgress={1}
        isSubmitting={false}
        args={{
          file_path: 'skills/demo/SKILL.md',
          content: '# Demo\n\nLarge generated body should not stay mounted after completion.',
        }}
        output="Created skills/demo/SKILL.md (4096 chars)."
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Created SKILL.md');
    expect(screen.getByText('Created skills/demo/SKILL.md (4096 chars).')).toBeInTheDocument();
    expect(screen.queryByText(/Large generated body/)).not.toBeInTheDocument();
  });

  it('shows edit_file replacement args while the call is in progress', () => {
    render(
      <FileAuthoringCall
        toolName="edit_file"
        initialProgress={0.5}
        isSubmitting={true}
        args={{
          file_path: 'skills/demo/SKILL.md',
          old_text: 'description: Old behavior',
          new_text: 'description: New behavior',
        }}
        output=""
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Editing SKILL.md');
    expect(screen.getByTestId('code-window-header')).toHaveAttribute('data-language', 'diff');
    const preview = screen.getByText((_, element) => element?.tagName.toLowerCase() === 'code');
    expect(preview).toHaveTextContent('--- old_text');
    expect(preview).toHaveTextContent('+++ new_text');
    expect(preview).toHaveTextContent('-description: Old behavior');
    expect(preview).toHaveTextContent('+description: New behavior');
  });

  it('shows batched edit_file replacements from edits args while the call is in progress', () => {
    render(
      <FileAuthoringCall
        toolName="edit_file"
        initialProgress={0.5}
        isSubmitting={true}
        args={{
          file_path: 'skills/demo/SKILL.md',
          edits: [
            { old_text: 'first old', new_text: 'first new' },
            { old_text: 'second old', new_text: 'second new' },
          ],
        }}
        output=""
      />,
    );

    const preview = screen.getByText((_, element) => element?.tagName.toLowerCase() === 'code');
    expect(preview).toHaveTextContent('--- old_text 1');
    expect(preview).toHaveTextContent('+++ new_text 2');
    expect(preview).toHaveTextContent('-first old');
    expect(preview).toHaveTextContent('+second new');
  });
});
