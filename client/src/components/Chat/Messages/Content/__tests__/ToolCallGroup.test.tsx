import React from 'react';
import { RecoilRoot } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import ToolCallGroup from '../ToolCallGroup';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: any) => {
    if (key === 'com_ui_used_n_tools') {
      return `Used ${values?.[0]} tools`;
    }
    if (key === 'com_ui_via_server') {
      return `via ${values?.[0]}`;
    }
    return key;
  },
  useExpandCollapse: (isExpanded: boolean) => ({
    style: {
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
    },
    ref: { current: null },
  }),
}));

jest.mock('~/hooks/MCP', () => ({
  useMCPIconMap: () => new Map(),
}));

jest.mock('../ToolOutput', () => ({
  StackedToolIcons: () => <span data-testid="stacked-icons" />,
  getMCPServerName: () => '',
}));

jest.mock('lucide-react', () => ({
  ChevronDown: () => <span>{'chevron'}</span>,
  Users: () => <span>{'users'}</span>,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
  getToolDisplayLabel: (name: string) => name,
}));

jest.mock('../Parts', () => ({
  AttachmentGroup: ({ attachments, variant }: any) => (
    <div
      data-testid="attachment-group"
      data-variant={variant ?? 'all'}
      data-count={attachments?.length ?? 0}
    />
  ),
}));

const makePart = (id: string, output = 'done'): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id,
      name: 'fetch_image',
      args: '{}',
      output,
    },
  }) as unknown as TMessageContentParts;

const imageAttachment: TAttachment = {
  filename: 'foo.png',
  filepath: '/files/foo.png',
  width: 128,
  height: 128,
  messageId: 'm1',
  toolCallId: 't1',
  conversationId: 'c1',
} as unknown as TAttachment;

const fileAttachment: TAttachment = {
  filename: 'bar.pdf',
  filepath: '/files/bar.pdf',
  messageId: 'm1',
  toolCallId: 't2',
  conversationId: 'c1',
} as unknown as TAttachment;

const renderGroup = (props: React.ComponentProps<typeof ToolCallGroup>) =>
  render(
    <RecoilRoot>
      <ToolCallGroup {...props} />
    </RecoilRoot>,
  );

describe('ToolCallGroup image hoisting', () => {
  const parts = [
    { part: makePart('t1'), idx: 0 },
    { part: makePart('t2'), idx: 1 },
  ];

  const baseProps = {
    parts,
    isSubmitting: false,
    isLast: false,
    lastContentIdx: 1,
    renderPart: (_p: TMessageContentParts, idx: number) => (
      <div data-testid={`inner-${idx}`} key={idx}>
        {'inner'}
      </div>
    ),
  } satisfies React.ComponentProps<typeof ToolCallGroup>;

  it('renders an AttachmentGroup outside the collapsible container with all attachments', () => {
    renderGroup({
      ...baseProps,
      groupAttachments: [imageAttachment, fileAttachment],
    });

    const group = screen.getByTestId('attachment-group');
    expect(group).toBeInTheDocument();
    expect(group.getAttribute('data-variant')).toBe('all');
    expect(group.getAttribute('data-count')).toBe('2');
  });

  it('hoists non-image attachments so they survive collapse', () => {
    renderGroup({
      ...baseProps,
      groupAttachments: [fileAttachment],
    });

    const group = screen.getByTestId('attachment-group');
    expect(group).toBeInTheDocument();
    expect(group.getAttribute('data-count')).toBe('1');
  });

  it('does not render an AttachmentGroup when there are no group attachments', () => {
    renderGroup(baseProps);
    expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
  });

  it('renders the image AttachmentGroup as a sibling of the collapsible panel, not a child', () => {
    const { container } = renderGroup({
      ...baseProps,
      groupAttachments: [imageAttachment],
    });

    const outer = container.firstChild as HTMLElement;
    const attachmentGroup = screen.getByTestId('attachment-group');
    expect(attachmentGroup.parentElement).toBe(outer);

    const collapsible = outer.querySelector('[style]');
    expect(collapsible?.contains(attachmentGroup)).toBe(false);
  });
});
