import React from 'react';
import { RecoilRoot } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import ContentParts from '../ContentParts';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: any) => {
    if (key === 'com_ui_used_n_tools') {
      return `Used ${values?.[0]} tools`;
    }
    return key;
  },
  useExpandCollapse: (isExpanded: boolean) => ({
    style: { display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr' },
    ref: { current: null },
  }),
  useProgress: (initial: number) => (initial >= 1 ? 1 : initial),
}));

jest.mock('~/hooks/MCP', () => ({
  useMCPIconMap: () => new Map(),
}));

jest.mock('../ToolOutput', () => ({
  StackedToolIcons: () => <span data-testid="stacked-icons" />,
  getMCPServerName: () => '',
  ToolIcon: () => <span data-testid="tool-icon" />,
  getToolIconType: () => 'mcp',
  isError: () => false,
}));

jest.mock('../ToolCallInfo', () => ({
  __esModule: true,
  default: () => <div data-testid="tool-call-info" />,
}));

jest.mock('../ProgressText', () => ({
  __esModule: true,
  default: ({ onClick, finishedText }: any) => (
    <div data-testid="progress-text" onClick={onClick}>
      {finishedText}
    </div>
  ),
}));

jest.mock('lucide-react', () => ({
  ChevronDown: () => <span>{'chevron'}</span>,
  TriangleAlert: () => <span>{'alert'}</span>,
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children }: any) => <button>{children}</button>,
}));

jest.mock('../Parts', () => ({
  AttachmentGroup: ({ attachments }: any) => (
    <div data-testid="attachment-group" data-count={attachments?.length ?? 0} />
  ),
  ExecuteCode: () => <div data-testid="execute-code" />,
  ImageGen: () => <div data-testid="image-gen" />,
  AgentUpdate: () => <div data-testid="agent-update" />,
  EmptyText: () => <div data-testid="empty-text" />,
  Reasoning: () => <div data-testid="reasoning" />,
  Summary: () => <div data-testid="summary" />,
  Text: ({ text }: any) => <div data-testid="text">{text}</div>,
  EditTextPart: () => <div data-testid="edit-text" />,
}));

jest.mock('../MemoryArtifacts', () => ({
  __esModule: true,
  default: () => <div data-testid="memory-artifacts" />,
}));

jest.mock('../WebSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="web-search" />,
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

jest.mock('../Image', () => ({
  __esModule: true,
  default: () => <div data-testid="image" />,
}));

jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('~/utils', () => {
  const actual = jest.requireActual('~/utils');
  return {
    ...actual,
    cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
    logger: { error: jest.fn() },
  };
});

const makeMcpToolCall = (id: string, hasOutput = true): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id,
      name: `getTinyImage${Constants_mcp_delimiter}Everything`,
      args: '{}',
      output: hasOutput ? 'image_returned' : '',
    },
  }) as unknown as TMessageContentParts;

// Real Constants.mcp_delimiter is "_mcp_" — match that
const Constants_mcp_delimiter = '_mcp_';

const imageAttachment = (toolCallId: string, name = 'tiny.png'): TAttachment =>
  ({
    filename: name,
    filepath: `/files/${name}`,
    width: 16,
    height: 16,
    messageId: 'm1',
    toolCallId,
    conversationId: 'c1',
  }) as unknown as TAttachment;

const renderContentParts = (props: React.ComponentProps<typeof ContentParts>) =>
  render(
    <RecoilRoot>
      <ContentParts {...props} />
    </RecoilRoot>,
  );

describe('ContentParts integration: MCP image hoist and grouping', () => {
  const baseProps = {
    messageId: 'msg1',
    isCreatedByUser: false,
    isLast: true,
    isSubmitting: false,
    isLatestMessage: true,
  };

  it('groups 2+ MCP tool calls and hoists their attachments outside the collapsible', () => {
    const content = [makeMcpToolCall('t1'), makeMcpToolCall('t2')];
    const attachments = [imageAttachment('t1', 'a.png'), imageAttachment('t2', 'b.png')];

    renderContentParts({
      ...baseProps,
      content,
      attachments,
    });

    const groups = screen.getAllByTestId('attachment-group');
    // One AttachmentGroup hoisted at the group level — inner ToolCalls skip rendering theirs.
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute('data-count')).toBe('2');
  });

  it('does not group a single tool call — image renders inline (no hoist)', () => {
    const content = [makeMcpToolCall('t1')];
    const attachments = [imageAttachment('t1', 'a.png')];

    renderContentParts({
      ...baseProps,
      content,
      attachments,
    });

    // Single tool call: AttachmentGroup is rendered by ToolCall, not hoisted.
    const groups = screen.queryAllByTestId('attachment-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute('data-count')).toBe('1');
    // No tool group label.
    expect(screen.queryByText(/Used .* tools/)).not.toBeInTheDocument();
  });

  it('hoists attachments from all parts in the group, even mixed image and non-image', () => {
    const fileAtt: TAttachment = {
      filename: 'doc.pdf',
      filepath: '/files/doc.pdf',
      messageId: 'm1',
      toolCallId: 't2',
      conversationId: 'c1',
    } as unknown as TAttachment;

    const content = [makeMcpToolCall('t1'), makeMcpToolCall('t2')];
    const attachments = [imageAttachment('t1', 'a.png'), fileAtt];

    renderContentParts({
      ...baseProps,
      content,
      attachments,
    });

    const groups = screen.getAllByTestId('attachment-group');
    expect(groups).toHaveLength(1);
    // Both image and file are in the hoisted group.
    expect(groups[0].getAttribute('data-count')).toBe('2');
  });

  it('renders no AttachmentGroup when grouped tool calls have no attachments', () => {
    const content = [makeMcpToolCall('t1'), makeMcpToolCall('t2')];

    renderContentParts({
      ...baseProps,
      content,
      attachments: [],
    });

    expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
  });
});
