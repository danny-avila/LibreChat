import React from 'react';
import { render, screen } from '@testing-library/react';
import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import Part from '../Part';

jest.mock('../Parts', () => ({
  ImageGen: () => <div data-testid="image-gen" />,
  ExecuteCode: () => <div data-testid="execute-code" />,
  AgentUpdate: () => <div data-testid="agent-update" />,
  EmptyText: () => <div data-testid="empty-text" />,
  Reasoning: () => <div data-testid="reasoning" />,
  Summary: () => <div data-testid="summary" />,
  Text: ({ text }: { text?: string }) => <div data-testid="text">{text}</div>,
  SkillCall: () => <div data-testid="skill-call" />,
  ReadFileCall: () => <div data-testid="read-file-call" />,
  FileAuthoringCall: ({ toolName }: { toolName: string }) => (
    <div data-testid="file-authoring-call" data-tool-name={toolName} />
  ),
  BashCall: ({ commandField }: { commandField?: string }) => (
    <div data-testid="bash-call" data-command-field={commandField ?? 'command'} />
  ),
  SubagentCall: () => <div data-testid="subagent-call" />,
}));

jest.mock('../MessageContent', () => ({
  ErrorMessage: () => <div data-testid="error-message" />,
}));

jest.mock('../RetrievalCall', () => ({
  __esModule: true,
  default: () => <div data-testid="retrieval-call" />,
}));

jest.mock('../AgentHandoff', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-handoff" />,
}));

jest.mock('../CodeAnalyze', () => ({
  __esModule: true,
  default: () => <div data-testid="code-analyze" />,
}));

jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../WebSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="web-search" />,
}));

jest.mock('../ToolCall', () => ({
  __esModule: true,
  default: () => <div data-testid="tool-call" />,
}));

jest.mock('../Image', () => ({
  __esModule: true,
  default: () => <div data-testid="image" />,
}));

jest.mock('~/utils', () => ({
  getCachedPreview: jest.fn(),
}));

const renderPart = (part: TMessageContentParts) =>
  render(<Part part={part} isSubmitting={false} showCursor={false} isCreatedByUser={false} />);

const toolCallPart = (name: string, args = '{"code":"echo hi"}'): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id: 'call_1',
      name,
      args,
      output: 'hi',
      progress: 1,
    },
  }) as unknown as TMessageContentParts;

describe('Part tool renderer selection', () => {
  it('routes bash PTC tool calls through the BashCall renderer', () => {
    renderPart(toolCallPart(Constants.BASH_PROGRAMMATIC_TOOL_CALLING));

    expect(screen.getByTestId('bash-call')).toHaveAttribute('data-command-field', 'code');
    expect(screen.queryByTestId('execute-code')).not.toBeInTheDocument();
  });

  it('routes default run_tools_with_code PTC calls through the BashCall renderer', () => {
    renderPart(toolCallPart(Constants.PROGRAMMATIC_TOOL_CALLING));

    expect(screen.getByTestId('bash-call')).toHaveAttribute('data-command-field', 'code');
    expect(screen.queryByTestId('execute-code')).not.toBeInTheDocument();
  });

  it('keeps Python PTC calls on the ExecuteCode renderer', () => {
    renderPart(
      toolCallPart(Constants.PROGRAMMATIC_TOOL_CALLING, '{"lang":"py","code":"print(1)"}'),
    );

    expect(screen.getByTestId('execute-code')).toBeInTheDocument();
    expect(screen.queryByTestId('bash-call')).not.toBeInTheDocument();
  });

  it('routes create_file calls through the file-authoring renderer', () => {
    renderPart(
      toolCallPart('create_file', '{"file_path":"skills/demo/SKILL.md","content":"# Demo"}'),
    );

    expect(screen.getByTestId('file-authoring-call')).toHaveAttribute(
      'data-tool-name',
      'create_file',
    );
    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
  });

  it('routes edit_file calls through the file-authoring renderer', () => {
    renderPart(
      toolCallPart(
        'edit_file',
        '{"file_path":"skills/demo/SKILL.md","old_text":"Demo","new_text":"Updated"}',
      ),
    );

    expect(screen.getByTestId('file-authoring-call')).toHaveAttribute(
      'data-tool-name',
      'edit_file',
    );
    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
  });
});
