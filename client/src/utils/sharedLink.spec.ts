import { sharedLinkData } from './sharedLink.fakeData';
import { addSharedLink, updateSharedLink, deleteSharedLink } from './sharedLink';

import type { TSharedLink, SharedLinkListData } from 'librechat-data-provider';

describe('Shared Link Utilities', () => {
  describe('addSharedLink', () => {
    it('adds a new shared link to the top of the list', () => {
      const data = { pages: [{ sharedLinks: [] }] };
      const newSharedLink = { shareId: 'new', updatedAt: '2023-04-02T12:00:00Z' };
      const newData = addSharedLink(
        data as unknown as SharedLinkListData,
        newSharedLink as TSharedLink,
      );
      expect(newData.pages[0].sharedLinks).toHaveLength(1);
      expect(newData.pages[0].sharedLinks[0].shareId).toBe('new');
    });
    it('does not add a shared link but updates it if it already exists', () => {
      const data = {
        pages: [
          {
            sharedLinks: [
              { shareId: '1', updatedAt: '2023-04-01T12:00:00Z' },
              { shareId: '2', updatedAt: '2023-04-01T13:00:00Z' },
            ],
          },
        ],
      };
      const newSharedLink = { shareId: '2', updatedAt: '2023-04-02T12:00:00Z' };
      const newData = addSharedLink(
        data as unknown as SharedLinkListData,
        newSharedLink as TSharedLink,
      );
      expect(newData.pages[0].sharedLinks).toHaveLength(2);
      expect(newData.pages[0].sharedLinks[0].shareId).toBe('2');
    });
  });

  describe('updateSharedLink', () => {
    it('updates an existing shared link and moves it to the top', () => {
      const initialData = {
        pages: [
          {
            sharedLinks: [
              { shareId: '1', updatedAt: '2023-04-01T12:00:00Z' },
              { shareId: '2', updatedAt: '2023-04-01T13:00:00Z' },
            ],
          },
        ],
      };
      const updatedSharedLink = { shareId: '1', updatedAt: '2023-04-02T12:00:00Z' };
      const newData = updateSharedLink(
        initialData as unknown as SharedLinkListData,
        updatedSharedLink as TSharedLink,
      );
      expect(newData.pages[0].sharedLinks).toHaveLength(2);
      expect(newData.pages[0].sharedLinks[0].shareId).toBe('1');
    });
    it('does not update a shared link if it does not exist', () => {
      const initialData = {
        pages: [
          {
            sharedLinks: [
              { shareId: '1', updatedAt: '2023-04-01T12:00:00Z' },
              { shareId: '2', updatedAt: '2023-04-01T13:00:00Z' },
            ],
          },
        ],
      };
      const updatedSharedLink = { shareId: '3', updatedAt: '2023-04-02T12:00:00Z' };
      const newData = updateSharedLink(
        initialData as unknown as SharedLinkListData,
        updatedSharedLink as TSharedLink,
      );
      expect(newData.pages[0].sharedLinks).toHaveLength(2);
      expect(newData.pages[0].sharedLinks[0].shareId).toBe('1');
    });
  });

  describe('deleteSharedLink', () => {
    it('removes a shared link by id', () => {
      const initialData = {
        pages: [
          {
            sharedLinks: [
              { shareId: '1', updatedAt: '2023-04-01T12:00:00Z' },
              { shareId: '2', updatedAt: '2023-04-01T13:00:00Z' },
            ],
          },
        ],
      };
      const newData = deleteSharedLink(initialData as unknown as SharedLinkListData, '1');
      expect(newData.pages[0].sharedLinks).toHaveLength(1);
      expect(newData.pages[0].sharedLinks[0].shareId).not.toBe('1');
    });

    it('does not remove a shared link if it does not exist', () => {
      const initialData = {
        pages: [
          {
            sharedLinks: [
              { shareId: '1', updatedAt: '2023-04-01T12:00:00Z' },
              { shareId: '2', updatedAt: '2023-04-01T13:00:00Z' },
            ],
          },
        ],
      };
      const newData = deleteSharedLink(initialData as unknown as SharedLinkListData, '3');
      expect(newData.pages[0].sharedLinks).toHaveLength(2);
    });
  });
});

describe('Shared Link Utilities with Fake Data', () => {
  describe('addSharedLink', () => {
    it('adds a new shared link to the existing fake data', () => {
      const newSharedLink = {
        shareId: 'new',
        updatedAt: new Date().toISOString(),
      } as TSharedLink;
      const initialLength = sharedLinkData.pages[0].sharedLinks.length;
      const newData = addSharedLink(sharedLinkData, newSharedLink);
      expect(newData.pages[0].sharedLinks.length).toBe(initialLength + 1);
      expect(newData.pages[0].sharedLinks[0].shareId).toBe('new');
    });
  });

  describe('updateSharedLink', () => {
    it('updates an existing shared link within fake data', () => {
      const updatedSharedLink = {
        ...sharedLinkData.pages[0].sharedLinks[0],
        title: 'Updated Title',
      };
      const newData = updateSharedLink(sharedLinkData, updatedSharedLink);
      expect(newData.pages[0].sharedLinks[0].title).toBe('Updated Title');
    });
  });

  describe('deleteSharedLink', () => {
    it('removes a shared link by id from fake data', () => {
      const shareIdToDelete = sharedLinkData.pages[0].sharedLinks[0].shareId as string;
      const newData = deleteSharedLink(sharedLinkData, shareIdToDelete);
      const deletedDataExists = newData.pages[0].sharedLinks.some(
        (c) => c.shareId === shareIdToDelete,
      );
      expect(deletedDataExists).toBe(false);
    });
  });
});
