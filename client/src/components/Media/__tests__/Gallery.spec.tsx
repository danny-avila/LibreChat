import { fireEvent, render, screen, within } from '@testing-library/react';
import type { MediaCatalog, MediaThread } from 'librechat-data-provider';
import type { useMediaThreads, MediaTile } from '~/data-provider/Media';
import { MediaGallery } from '../Gallery';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: { title?: string }) =>
    values?.title == null ? key : key + ':' + values.title,
}));

const catalog: MediaCatalog = {
  schemaVersion: 1,
  version: 'catalog',
  clientPollIntervalMs: 5000,
  clientCatchUpIntervalMs: 60000,
  limits: {
    maxPromptChars: 1000,
    maxTitleChars: 200,
    maxInputs: 4,
    maxOutputs: 2,
    pageSize: 24,
    maxPageSize: 100,
    maxAssetRetainers: 100,
    maxNativeParts: 100,
    maxNativePartBytes: 1000000,
    maxNativeRecordingBytes: 4194304,
    maxProviderOptionBytes: 32768,
    maxProviderOptionDepth: 8,
    maxPresets: 50,
  },
  offerings: [
    {
      connectionId: 'provider',
      connectionName: 'Image provider',
      modelId: 'image-model',
      modelName: 'Painterly XL',
      api: 'openai.images',
      available: true,
      capabilities: [],
    },
  ],
};
const selection = { connectionId: 'provider', modelId: 'image-model', catalogVersion: 'catalog' };
const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const thread = (change: Partial<MediaThread>): MediaThread => ({
  schemaVersion: 1,
  threadId: 'thread',
  title: 'Harbor at dusk',
  version: 1,
  createdAt: recent,
  updatedAt: recent,
  pendingJobCount: 0,
  turnCount: 1,
  cover: {
    file_id: 'cover',
    filename: 'cover.png',
    filepath: '/images/cover.png',
    type: 'image/png',
    bytes: 100,
    width: 1024,
    height: 1024,
  },
  activity: {
    readyOutputs: 1,
    latestJob: { phase: 'succeeded', operation: 'image.generate', selection },
  },
  ...change,
});
const tile = (value: MediaThread): MediaTile => ({
  threadId: value.threadId,
  title: value.title,
  thread: value,
});
const idleQuery = {
  isLoading: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  refetch: jest.fn(),
  fetchNextPage: jest.fn(),
} as unknown as ReturnType<typeof useMediaThreads>;

function mount(tiles: MediaTile[], overrides: Partial<Parameters<typeof MediaGallery>[0]> = {}) {
  const props = {
    tiles,
    catalog,
    query: idleQuery,
    filter: 'all' as const,
    search: '',
    columns: 3 as const,
    onFilter: jest.fn(),
    onSearch: jest.fn(),
    onCreate: jest.fn(),
    onColumns: jest.fn(),
    onOpen: jest.fn(),
    ...overrides,
  };
  render(<MediaGallery {...props} />);
  return props;
}

test('cards show the cover, model, and a relative time without a status for finished work', () => {
  const props = mount([tile(thread({}))]);
  const card = screen.getByRole('button', { name: 'com_media_open_named:Harbor at dusk' });
  expect(within(card).getByRole('img')).toHaveAttribute('src', '/images/cover.png');
  expect(within(card).getByRole('img')).toHaveClass('object-cover');
  expect(card).toHaveAccessibleDescription(/Painterly XL/);
  const time = within(card).getByText(/ago|hour/);
  expect(time.tagName).toBe('TIME');
  expect(time).toHaveAttribute('datetime', recent);
  expect(within(card).queryByText('com_media_phase_succeeded')).not.toBeInTheDocument();
  fireEvent.click(card);
  expect(props.onOpen).toHaveBeenCalledWith('thread');
  expect(document.querySelector('[data-media-gallery]')).toHaveAttribute('data-columns', '3');
});

test('unfinished work carries its status in the caption and video covers show a play glyph', () => {
  mount([
    tile(thread({ threadId: 'running', title: 'Running', pendingJobCount: 1 })),
    tile(
      thread({
        threadId: 'failed',
        title: 'Failed',
        cover: undefined,
        activity: {
          readyOutputs: 0,
          latestJob: { phase: 'failed', operation: 'image.generate', selection },
        },
      }),
    ),
    tile(
      thread({
        threadId: 'video',
        title: 'Video',
        cover: {
          file_id: 'clip',
          filename: 'clip.mp4',
          filepath: '/images/clip.mp4',
          type: 'video/mp4',
          bytes: 100,
        },
        activity: {
          readyOutputs: 1,
          latestJob: { phase: 'succeeded', operation: 'video.generate', selection },
        },
      }),
    ),
  ]);
  const running = screen.getByRole('button', { name: 'com_media_open_named:Running' });
  expect(within(running).getByText('com_media_phase_running')).toBeInTheDocument();
  const failed = screen.getByRole('button', { name: 'com_media_open_named:Failed' });
  expect(within(failed).getByText('com_media_no_output')).toBeInTheDocument();
  expect(within(failed).getByText('com_media_phase_failed')).toBeInTheDocument();
  const video = screen.getByRole('button', { name: 'com_media_open_named:Video' });
  expect(within(video).getByLabelText('com_media_video_preview')).toBeInTheDocument();
  expect(video.querySelector('.lucide-play')).toBeInTheDocument();
});

test('a receipt without a projection reads as preparing', () => {
  mount([
    {
      threadId: 'pending',
      title: 'Pending prompt',
      receipt: {
        schemaVersion: 1,
        clientRequestId: 'request',
        threadId: 'pending',
        turnId: 'turn',
        jobId: 'job',
        phase: 'preparing',
      },
    },
  ]);
  const card = screen.getByRole('button', { name: 'com_media_open_named:Pending prompt' });
  expect(within(card).getByText('com_media_preparing')).toBeInTheDocument();
});

test('the density control is a single radiogroup and search matches the model name', () => {
  const props = mount([tile(thread({}))], { search: 'painter' });
  expect(screen.getByRole('button', { name: 'com_media_open_named:Harbor at dusk' })).toBeVisible();
  const density = within(screen.getByRole('radiogroup', { name: 'com_media_columns' }));
  expect(density.getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(density.getByRole('radio', { name: '4' }));
  expect(props.onColumns).toHaveBeenCalledWith(4);
});

test('filtered views that match nothing offer a way back to everything', () => {
  const props = mount([tile(thread({}))], { search: 'nothing here' });
  expect(screen.getByText('com_media_no_matches')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_show_all' }));
  expect(props.onSearch).toHaveBeenCalledWith('');
  expect(props.onFilter).toHaveBeenCalledWith('all');
});
