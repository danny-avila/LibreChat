import React from 'react';
import { RecoilRoot } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import SearchContent from '../SearchContent';

jest.mock('~/store', () => {
  const { atom } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      enableUserMsgMarkdown: atom({ key: 'test-enableUserMsgMarkdown', default: true }),
    },
  };
});

jest.mock('../Part', () => ({
  __esModule: true,
  default: ({ part }: { part: TMessageContentParts }) => (
    <div data-testid="part">{JSON.stringify(part)}</div>
  ),
}));

jest.mock('../MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-lite">{content}</div>,
}));

jest.mock('../MessageContent', () => ({
  UnfinishedMessage: () => <div data-testid="unfinished" />,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '),
  mapAttachments: () => ({}),
}));

const renderSearchContent = (message: TMessage) =>
  render(
    <RecoilRoot>
      <SearchContent message={message} />
    </RecoilRoot>,
  );

describe('SearchContent', () => {
  it('renders content array with tool_call parts without throwing', () => {
    const message = {
      messageId: 'msg-1',
      isCreatedByUser: false,
      content: [
        {
          [ContentTypes.TEXT]: { value: 'some text' },
          type: ContentTypes.TEXT,
        },
        {
          [ContentTypes.TOOL_CALL]: { id: 'call-1', name: 'search', args: '{}', output: 'ok' },
          type: ContentTypes.TOOL_CALL,
        },
      ],
    } as unknown as TMessage;

    const { container } = renderSearchContent(message);

    const parts = screen.getAllByTestId('part');
    expect(parts).toHaveLength(2);
    expect(container).toBeTruthy();
  });

  it('renders MarkdownLite for plain text messages without content array', () => {
    const message = {
      messageId: 'msg-2',
      isCreatedByUser: true,
      text: 'hello world',
    } as unknown as TMessage;

    renderSearchContent(message);

    const markdown = screen.getByTestId('markdown-lite');
    expect(markdown).toHaveTextContent('hello world');
  });
});
