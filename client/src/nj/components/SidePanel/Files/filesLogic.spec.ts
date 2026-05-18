import { groupFiles } from '~/nj/components/SidePanel/Files/filesLogic';
import type { TFile } from 'librechat-data-provider';

const baseFile: TFile = {
  user: 'user1',
  file_id: 'f1',
  bytes: 100,
  embedded: false,
  filename: 'test.txt',
  filepath: '/uploads/test.txt',
  object: 'file',
  type: 'text/plain',
  usage: 0,
};

describe('filesLogic', () => {
  describe('groupFiles', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('empty case', () => {
      expect(groupFiles([])).toEqual({
        pinned: [],
        today: [],
        yesterday: [],
        previous: [],
      });
    });

    test('groups pinned files', () => {
      jest.setSystemTime(new Date('2026-05-15T12:00:00Z'));

      const pinned1: TFile = {
        ...baseFile,
        file_id: 'p1',
        pinned: true,
        updatedAt: '2020-01-01T00:00:00Z',
      };
      const pinned2: TFile = {
        ...baseFile,
        file_id: 'p2',
        pinned: true,
        updatedAt: '2026-05-15T08:00:00Z',
      };
      const today1: TFile = { ...baseFile, file_id: 't1', createdAt: '2026-05-15T08:00:00Z' };
      const today2: TFile = { ...baseFile, file_id: 't2', createdAt: '2026-05-15T16:00:00Z' };
      const yesterday1: TFile = { ...baseFile, file_id: 'y1', createdAt: '2026-05-14T08:00:00Z' };
      const yesterday2: TFile = { ...baseFile, file_id: 'y2', createdAt: '2026-05-14T16:00:00Z' };
      const previous1: TFile = { ...baseFile, file_id: 'p1', createdAt: '2026-05-13T08:00:00Z' };
      const previous2: TFile = { ...baseFile, file_id: 'p2', createdAt: '2026-05-13T16:00:00Z' };

      const result = groupFiles([
        pinned1,
        pinned2,
        today1,
        today2,
        yesterday1,
        yesterday2,
        previous1,
        previous2,
      ]);

      // Our expectations are:
      // 1. Pinned files only show up in the pinned section (not also the date-based section)
      // 2. Date-based sections are grouped properly
      // 3. Pinned files are sorted based on updatedAt
      // 4. Date-based sections are sorted based on createdAt
      expect(result).toEqual({
        pinned: [pinned2, pinned1],
        today: [today2, today1],
        yesterday: [yesterday2, yesterday1],
        previous: [previous2, previous1],
      });
    });

    test('day-based groups are relative to user timezone, not UTC', () => {
      // "now" is 2am UTC May 15 → in New York (UTC-4) it's 10pm May 14, so local "today" = May 14
      jest.setSystemTime(new Date('2026-05-15T02:00:00Z'));

      // This file was created at 11pm UTC May 14 = 7pm EDT May 14
      const file: TFile = { ...baseFile, file_id: 'tz1', createdAt: '2026-05-14T23:00:00Z' };

      // In UTC: "today" is May 15, so May 14 is "yesterday"
      const utcResult = groupFiles([file], 'UTC');
      expect(utcResult.yesterday).toEqual([file]);
      expect(utcResult.today).toHaveLength(0);

      // In New York: "today" is May 14, so May 14 local is "today"
      const nyResult = groupFiles([file], 'America/New_York');
      expect(nyResult.today).toEqual([file]);
      expect(nyResult.yesterday).toHaveLength(0);
    });
  });
});
