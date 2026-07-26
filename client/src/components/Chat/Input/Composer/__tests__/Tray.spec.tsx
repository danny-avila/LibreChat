import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComposerItem } from '~/hooks/Input/useComposerItems';
import type { ExtendedFile } from '~/common';
import Tray from '../Tray';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFileHandlingNoChatContext: () => ({ abortUpload: jest.fn() }),
}));

/* Files keep their own component, with its own upload/delete stack; the tray's
   job is to hand it the staged map, which is what is asserted here. */
jest.mock('../../Files/FileRow', () => ({
  __esModule: true,
  default: ({ files }: { files: Map<string, unknown> }) =>
    files.size > 0 ? <div data-testid="file-row">{files.size}</div> : null,
}));

const item = (overrides: Partial<ComposerItem> = {}): ComposerItem => ({
  id: 'quote:0',
  kind: 'quote',
  label: 'the second paragraph',
  title: 'the second paragraph',
  remove: jest.fn(),
  ...overrides,
});

function renderTray(items: ComposerItem[], files: Map<string, ExtendedFile> = new Map()) {
  return render(
    <RecoilRoot>
      <Tray
        items={items}
        conversation={null}
        files={files}
        setFiles={jest.fn()}
        setFilesLoading={jest.fn()}
        isRTL={false}
      />
    </RecoilRoot>,
  );
}

describe('Tray', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when no context is staged', () => {
    const { container } = renderTray([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one list holding every staged kind', () => {
    renderTray(
      [
        item({ id: 'quote:0', kind: 'quote', label: 'the second paragraph' }),
        item({ id: 'skill:a', kind: 'skill', label: 'code-review' }),
      ],
      new Map([['f1', {} as ExtendedFile]]),
    );

    expect(screen.getByTestId('composer-tray')).toBeInTheDocument();
    expect(screen.getByTestId('file-row')).toBeInTheDocument();
    expect(screen.getByTestId('composer-chip-quote')).toBeInTheDocument();
    expect(screen.getByTestId('composer-chip-skill')).toBeInTheDocument();
  });

  it('labels each remove button for its own kind', () => {
    renderTray([
      item({ id: 'quote:0', kind: 'quote', label: 'excerpt' }),
      item({ id: 'skill:a', kind: 'skill', label: 'code-review' }),
    ]);

    expect(screen.getByLabelText('com_ui_remove_quote')).toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_remove_skill')).toBeInTheDocument();
  });

  it('invokes the item own remove handler', () => {
    const remove = jest.fn();
    renderTray([item({ remove })]);
    fireEvent.click(screen.getByLabelText('com_ui_remove_quote'));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('opens for staged files even with nothing else in it', () => {
    renderTray([], new Map([['f1', {} as ExtendedFile]]));
    expect(screen.getByTestId('composer-tray')).toBeInTheDocument();
    expect(screen.getByTestId('file-row')).toBeInTheDocument();
  });
});
