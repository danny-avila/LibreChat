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
        com_ui_updated_file: 'Updated {{0}}',
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

  it('keeps authored content visible alongside the output after create_file completes', () => {
    render(
      <FileAuthoringCall
        toolName="create_file"
        initialProgress={1}
        isSubmitting={false}
        args={{
          file_path: 'skills/demo/SKILL.md',
          content: '# Demo\n\nLarge generated body stays visible after completion.',
        }}
        output="Created skills/demo/SKILL.md (4096 chars)."
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Created SKILL.md');
    expect(screen.getByTestId('code-window-header')).toHaveAttribute('data-language', 'SKILL.md');
    expect(screen.getByText(/Large generated body stays visible/)).toBeInTheDocument();
    expect(screen.getByText('Created skills/demo/SKILL.md (4096 chars).')).toBeInTheDocument();
  });

  it('labels a create_file overwrite as Updated when the output summary says so', () => {
    render(
      <FileAuthoringCall
        toolName="create_file"
        initialProgress={1}
        isSubmitting={false}
        args={{
          file_path: 'skills/demo/SKILL.md',
          content: '# Demo\n\nRevised body.',
        }}
        output="Updated skills/demo/SKILL.md (8302 chars)."
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Updated SKILL.md');
  });

  it('prefers the output diff over the args preview after edit_file completes', () => {
    const output = [
      'Edited skills/demo/SKILL.md (exact match).',
      '',
      '--- skills/demo/SKILL.md',
      '+++ skills/demo/SKILL.md',
      '@@ -1,1 +1,1 @@',
      '-old line',
      '+new line',
    ].join('\n');
    render(
      <FileAuthoringCall
        toolName="edit_file"
        initialProgress={1}
        isSubmitting={false}
        args={{
          file_path: 'skills/demo/SKILL.md',
          old_text: 'old line',
          new_text: 'new line',
        }}
        output={output}
      />,
    );

    expect(screen.getByText('old line').closest('div')).toHaveClass('bg-red-500/10');
    expect(screen.getByText('new line').closest('div')).toHaveClass('bg-green-500/10');
    expect(screen.queryByText(/--- old_text/)).not.toBeInTheDocument();
  });

  it('shows the attempted input alongside the error output when edit_file fails', () => {
    render(
      <FileAuthoringCall
        toolName="edit_file"
        initialProgress={1}
        isSubmitting={false}
        args={{
          file_path: 'skills/demo/SKILL.md',
          old_text: 'missing text',
          new_text: 'replacement',
        }}
        output="Error: old_text matched 0 locations in skills/demo/SKILL.md."
      />,
    );

    expect(screen.getByText('missing text').closest('div')).toHaveClass('bg-red-500/10');
    expect(screen.getByText('replacement').closest('div')).toHaveClass('bg-green-500/10');
    expect(screen.getByText(/matched 0 locations/)).toBeInTheDocument();
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
    expect(screen.getByTestId('code-window-header')).toHaveAttribute('data-language', 'SKILL.md');
    expect(screen.queryByText(/--- old_text/)).not.toBeInTheDocument();
    expect(screen.getByText('description: Old behavior').closest('div')).toHaveClass(
      'bg-red-500/10',
    );
    expect(screen.getByText('description: New behavior').closest('div')).toHaveClass(
      'bg-green-500/10',
    );
  });

  it('streams create_file content from partial JSON string args during run_step_delta', () => {
    render(
      <FileAuthoringCall
        toolName="create_file"
        initialProgress={0.5}
        isSubmitting={true}
        args={'{"file_path":"skills/demo/SKILL.md","content":"# Demo\\n\\nStreaming body so far'}
        output=""
      />,
    );

    expect(screen.getByTestId('progress-text')).toHaveTextContent('Creating SKILL.md');
    expect(screen.getByTestId('code-window-header')).toHaveAttribute('data-language', 'SKILL.md');
    expect(screen.getByText(/Streaming body so far/)).toBeInTheDocument();
  });

  it('streams edit_file replacement preview from partial JSON string args', () => {
    render(
      <FileAuthoringCall
        toolName="edit_file"
        initialProgress={0.5}
        isSubmitting={true}
        args={
          '{"file_path":"skills/demo/SKILL.md","old_text":"description: Old behavior","new_text":"description: New beh'
        }
        output=""
      />,
    );

    expect(screen.getByText('description: Old behavior').closest('div')).toHaveClass(
      'bg-red-500/10',
    );
    expect(screen.getByText('description: New beh').closest('div')).toHaveClass('bg-green-500/10');
  });

  it('streams batched edit_file previews from a partial edits array', () => {
    const args =
      '{"file_path":"skills/demo/SKILL.md","edits":[' +
      '{"old_text":"first old","new_text":"first new"},' +
      '{"old_text":"second old","new_text":"second n';
    render(
      <FileAuthoringCall
        toolName="edit_file"
        initialProgress={0.5}
        isSubmitting={true}
        args={args}
        output=""
      />,
    );

    const diff = screen.getByTestId('diff-view');
    expect(screen.getByText('first old').closest('div')).toHaveClass('bg-red-500/10');
    expect(screen.getByText('first new').closest('div')).toHaveClass('bg-green-500/10');
    expect(screen.getByText('second old').closest('div')).toHaveClass('bg-red-500/10');
    expect(screen.getByText('second n').closest('div')).toHaveClass('bg-green-500/10');
    expect(diff).toBeInTheDocument();
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

    expect(screen.getByText('first old').closest('div')).toHaveClass('bg-red-500/10');
    expect(screen.getByText('second new').closest('div')).toHaveClass('bg-green-500/10');
  });
});
