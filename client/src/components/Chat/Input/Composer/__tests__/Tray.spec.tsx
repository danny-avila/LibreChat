import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import type { ComposerItem } from '~/hooks/Input/useComposerItems';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import type { ExtendedFile } from '~/common';
import store from '~/store';
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

const mockRemoveSteer = jest.fn();
const mockRemoveQueued = jest.fn();
const mockRetrySteer = jest.fn();

jest.mock('../../SteerMenu', () => ({
  RowMenu: () => <div data-testid="row-menu" />,
  useDefaultToggleEntry: () => ({ key: 'toggle', label: 'toggle', onClick: jest.fn() }),
  ICON_BTN_CLASS: '',
  PRIMARY_BTN_CLASS: '',
}));

const CONVO_ID = 'convo-1';

const steering = {
  enabled: true,
  queueKey: CONVO_ID,
  duringRunActive: false,
  canSteer: false,
  removeSteer: mockRemoveSteer,
  removeQueued: mockRemoveQueued,
  retrySteer: mockRetrySteer,
  sendQueuedNow: jest.fn(),
  convertSteerToQueue: jest.fn(),
} as unknown as SteeringControls;

const item = (overrides: Partial<ComposerItem> = {}): ComposerItem => ({
  id: 'quote:0',
  kind: 'quote',
  label: 'the second paragraph',
  title: 'the second paragraph',
  remove: jest.fn(),
  ...overrides,
});

function renderTray(
  items: ComposerItem[],
  seed?: (snapshot: MutableSnapshotLike) => void,
  files: Map<string, ExtendedFile> = new Map(),
) {
  return render(
    <RecoilRoot initializeState={seed}>
      <Tray
        items={items}
        conversationId={CONVO_ID}
        conversation={null}
        files={files}
        setFiles={jest.fn()}
        setFilesLoading={jest.fn()}
        isRTL={false}
        steering={steering}
        steeringEnabled
        onEditToComposer={jest.fn()}
        onRestoreToComposer={jest.fn()}
      />
    </RecoilRoot>,
  );
}

type MutableSnapshotLike = { set: (atom: never, value: never) => void };

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
      undefined,
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
    renderTray([], undefined, new Map([['f1', {} as ExtendedFile]]));
    expect(screen.getByTestId('composer-tray')).toBeInTheDocument();
    expect(screen.getByTestId('file-row')).toBeInTheDocument();
  });

  it('keeps queued messages as full-width rows with their own actions', () => {
    const queued: QueuedMessage[] = [
      { id: 'q1', text: 'follow up on this', files: [], quotes: [], manualSkills: [] },
    ] as unknown as QueuedMessage[];

    renderTray([], ({ set }: MutableSnapshotLike) =>
      set(store.queuedMessagesByConvoId(CONVO_ID) as never, queued as never),
    );

    expect(screen.getByTestId('queued-message-row')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));
    expect(mockRemoveQueued).toHaveBeenCalledWith('q1');
  });

  it('surfaces failed steers with a retry affordance', () => {
    const steers: PendingSteer[] = [
      {
        steerId: 's1',
        text: 'actually use zod',
        status: 'failed',
        files: [],
        quotes: [],
        manualSkills: [],
      },
    ] as unknown as PendingSteer[];

    renderTray([], ({ set }: MutableSnapshotLike) =>
      set(store.pendingSteersByConvoId(CONVO_ID) as never, steers as never),
    );

    expect(screen.getByTestId('steer-message-row')).toBeInTheDocument();
    expect(screen.getByText('com_ui_steer_failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('com_ui_steer_retry'));
    expect(mockRetrySteer).toHaveBeenCalled();
  });

  it('ignores steer state when steering is disabled for the endpoint', () => {
    const queued = [
      { id: 'q1', text: 'follow up', files: [], quotes: [], manualSkills: [] },
    ] as unknown as QueuedMessage[];

    const { container } = render(
      <RecoilRoot
        initializeState={({ set }: MutableSnapshotLike) =>
          set(store.queuedMessagesByConvoId(CONVO_ID) as never, queued as never)
        }
      >
        <Tray
          items={[]}
          conversationId={CONVO_ID}
          conversation={null}
          files={new Map()}
          setFiles={jest.fn()}
          setFilesLoading={jest.fn()}
          isRTL={false}
          steering={steering}
          steeringEnabled={false}
          onEditToComposer={jest.fn()}
          onRestoreToComposer={jest.fn()}
        />
      </RecoilRoot>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
