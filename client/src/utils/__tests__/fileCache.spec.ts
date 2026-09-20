import { QueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { addFileToCache } from '../files';

const file: TFile = {
  file_id: 'one',
  user: 'owner',
  filename: 'one.png',
  filepath: '/images/one.png',
  type: 'image/png',
  bytes: 10,
  object: 'file',
  usage: 0,
  embedded: false,
};

test('initializes an empty cache, appends a file, and merges an existing file without losing metadata', () => {
  const client = new QueryClient();
  addFileToCache(client, { ...file, embedded: false, metadata: { fileIdentifier: 'original' } });
  expect(client.getQueryData([QueryKeys.files])).toEqual([
    expect.objectContaining({ file_id: 'one' }),
  ]);
  addFileToCache(client, { ...file, file_id: 'two' });
  addFileToCache(client, { ...file, filename: 'updated.png', bytes: 20 });
  expect(client.getQueryData([QueryKeys.files])).toEqual([
    expect.objectContaining({
      file_id: 'one',
      filename: 'updated.png',
      bytes: 20,
      embedded: false,
      metadata: { fileIdentifier: 'original' },
    }),
    expect.objectContaining({ file_id: 'two' }),
  ]);
  client.clear();
});
