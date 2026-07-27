import { renderHook } from '@testing-library/react';
import type { TFile } from 'librechat-data-provider';
import useRecentFiles from '../useRecentFiles';

/**
 * The palette's "your files" section: newest first, and fetched only while the
 * popup is open, since this is the user's whole file list.
 */

let mockFiles: TFile[] | undefined;
let mockEnabled: boolean | undefined;

jest.mock('~/data-provider', () => ({
  useGetFiles: ({ enabled }: { enabled: boolean }) => {
    mockEnabled = enabled;
    return { data: mockFiles };
  },
}));

jest.mock('~/hooks/Files/useAttachExisting', () => ({
  __esModule: true,
  default: () => jest.fn(),
}));

const file = (over: Partial<TFile>): TFile => ({ file_id: 'f', ...over }) as TFile;

const context = {
  files: new Map(),
  setFiles: jest.fn(),
  conversation: null,
};

const recent = (enabled = true) =>
  renderHook(() => useRecentFiles(enabled, context)).result.current;

describe('useRecentFiles', () => {
  beforeEach(() => {
    mockFiles = undefined;
    mockEnabled = undefined;
  });

  it('fetches only while the palette is open', () => {
    recent(false);
    expect(mockEnabled).toBe(false);
    recent(true);
    expect(mockEnabled).toBe(true);
  });

  it('lists nothing before the files have loaded', () => {
    expect(recent().files).toEqual([]);
  });

  it('puts the most recently touched file first', () => {
    mockFiles = [
      file({ file_id: 'older', createdAt: '2026-01-01T00:00:00Z' }),
      file({ file_id: 'newest', createdAt: '2026-07-01T00:00:00Z' }),
      file({ file_id: 'middle', createdAt: '2026-03-01T00:00:00Z' }),
    ];
    expect(recent().files.map((item) => item.file_id)).toEqual(['newest', 'middle', 'older']);
  });

  /* A file that was re-uploaded or renamed is newly touched, so its update
     time is what places it, not the day it first arrived. */
  it('prefers the update time over the creation time', () => {
    mockFiles = [
      file({
        file_id: 'edited',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
      }),
      file({ file_id: 'newer-original', createdAt: '2026-07-01T00:00:00Z' }),
    ];
    expect(recent().files.map((item) => item.file_id)).toEqual(['edited', 'newer-original']);
  });

  it('leaves an undated file at the back rather than dropping it', () => {
    mockFiles = [file({ file_id: 'undated' }), file({ file_id: 'dated', createdAt: '2026-01-01' })];
    expect(recent().files.map((item) => item.file_id)).toEqual(['dated', 'undated']);
  });
});
