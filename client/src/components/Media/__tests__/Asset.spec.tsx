import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MediaAsset } from 'librechat-data-provider';
import { MediaPreview } from '../Asset';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

const asset: MediaAsset = {
  file_id: 'gemini-image',
  filename: 'original.jpeg',
  filepath: '/images/user/original.jpg',
  type: 'image/jpeg',
  bytes: 100,
  width: 512,
  height: 512,
};

test('loads gallery images immediately and recovers a failed preview without another generation', () => {
  const view = render(<MediaPreview asset={asset} />);
  const image = screen.getByRole('img');
  expect(image).toHaveAttribute('loading', 'eager');
  expect(screen.getByText('com_media_preview_loading')).toBeInTheDocument();
  fireEvent.error(image);
  fireEvent.click(screen.getByRole('button', { name: 'com_media_retry_preview' }));
  expect(screen.getByRole('img')).toHaveAttribute('src', '/images/user/original.jpg');
  fireEvent.load(screen.getByRole('img'));
  expect(screen.queryByText('com_media_preview_loading')).not.toBeInTheDocument();
  expect(screen.queryByText('com_media_preview_failed')).not.toBeInTheDocument();
  fireEvent.error(screen.getByRole('img'));
  view.rerender(
    <MediaPreview
      asset={{ ...asset, file_id: 'another-image', filepath: '/images/user/another.jpg' }}
    />,
  );
  expect(screen.getByRole('img')).toHaveAttribute('src', '/images/user/another.jpg');
  expect(screen.queryByText('com_media_preview_failed')).not.toBeInTheDocument();
});

test('a failed gallery thumbnail stays noninteractive inside its parent card', () => {
  render(
    <button type="button">
      <MediaPreview asset={asset} compact />
    </button>,
  );
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByText('com_media_preview_unavailable')).toBeInTheDocument();
});

test('audio references use an audio player and clear loading when metadata arrives', () => {
  render(
    <MediaPreview
      asset={{ ...asset, type: 'audio/mpeg', filepath: '/media/voice.mp3' }}
      compact
      interactive
    />,
  );
  const player = screen.getByLabelText('com_media_audio_preview');
  expect(player.tagName).toBe('AUDIO');
  expect(player).toHaveAttribute('controls');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  fireEvent.loadedMetadata(player);
  expect(screen.queryByText('com_media_preview_loading')).not.toBeInTheDocument();
});

test('video reference previews expose playback controls independently of compact thumbnails', () => {
  render(
    <MediaPreview
      asset={{ ...asset, type: 'video/mp4', filepath: '/media/clip.mp4' }}
      compact
      interactive
    />,
  );
  const player = screen.getByLabelText('com_media_video_preview');
  expect(player.tagName).toBe('VIDEO');
  expect(player).toHaveAttribute('controls');
  fireEvent.loadedMetadata(player);
  expect(screen.queryByText('com_media_preview_loading')).not.toBeInTheDocument();
});
