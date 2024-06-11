import { convoData } from './convos.fakeData';
import {
  dateKeys,
  addConversation,
  updateConvoFields,
  updateConversation,
  deleteConversation,
  findPageForConversation,
  groupConversationsByDate,
} from './convos';
import type { TConversation, ConversationData } from 'librechat-data-provider';
import { normalizeData } from './collection';

describe('Conversation Utilities', () => {
  describe('groupConversationsByDate', () => {
    it('groups conversations by date correctly', () => {
      const conversations = [
        { conversationId: '1', updatedAt: '2023-04-01T12:00:00Z' },
        { conversationId: '2', updatedAt: new Date().toISOString() },
        { conversationId: '3', updatedAt: new Date(Date.now() - 86400000).toISOString() }, // 86400 seconds ago = yesterday
        { conversationId: '4', updatedAt: new Date(Date.now() - 86400000 * 2).toISOString() }, // 2 days ago (previous 7 days)
        { conversationId: '5', updatedAt: new Date(Date.now() - 86400000 * 8).toISOString() }, // 8 days ago (previous 30 days)
      ];
      const grouped = groupConversationsByDate(conversations as TConversation[]);
      expect(grouped[0][0]).toBe(dateKeys.today);
      expect(grouped[0][1]).toHaveLength(1);
      expect(grouped[1][0]).toBe(dateKeys.yesterday);
      expect(grouped[1][1]).toHaveLength(1);
      expect(grouped[2][0]).toBe(dateKeys.previous7Days);
      expect(grouped[2][1]).toHaveLength(1);
      expect(grouped[3][0]).toBe(dateKeys.previous30Days);
      expect(grouped[3][1]).toHaveLength(1);
      expect(grouped[4][0]).toBe(' 2023');
      expect(grouped[4][1]).toHaveLength(1);
    });

    it('returns an empty array for no conversations', () => {
      expect(groupConversationsByDate([])).toEqual([]);
    });

    it('skips conversations with duplicate conversationIds', () => {
      const conversations = [
        { conversationId: '1', updatedAt: '2023-12-01T12:00:00Z' }, // " 2023"
        { conversationId: '2', updatedAt: '2023-11-25T12:00:00Z' }, // " 2023"
        { conversationId: '1', updatedAt: '2023-11-20T12:00:00Z' }, // Should be skipped because of duplicate ID
        { conversationId: '3', updatedAt: '2022-12-01T12:00:00Z' }, // " 2022"
      ];

      const grouped = groupConversationsByDate(conversations as TConversation[]);

      expect(grouped).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([' 2023', expect.arrayContaining(conversations.slice(0, 2))]),
          expect.arrayContaining([' 2022', expect.arrayContaining([conversations[3]])]),
        ]),
      );

      // No duplicate IDs are present
      const allGroupedIds = grouped.flatMap(([, convs]) => convs.map((c) => c.conversationId));
      const uniqueIds = [...new Set(allGroupedIds)];
      expect(allGroupedIds.length).toBe(uniqueIds.length);
    });
  });

  describe('addConversation', () => {
    it('adds a new conversation to the top of the list', () => {
      const data = { pages: [{ conversations: [] }] };
      const newConversation = { conversationId: 'new', updatedAt: '2023-04-02T12:00:00Z' };
      const newData = addConversation(
        data as unknown as ConversationData,
        newConversation as TConversation,
      );
      expect(newData.pages[0].conversations).toHaveLength(1);
      expect(newData.pages[0].conversations[0].conversationId).toBe('new');
    });
  });

  describe('updateConversation', () => {
    it('updates an existing conversation and moves it to the top', () => {
      const initialData = {
        pages: [
          {
            conversations: [
              { conversationId: '1', updatedAt: '2023-04-01T12:00:00Z' },
              { conversationId: '2', updatedAt: '2023-04-01T13:00:00Z' },
            ],
          },
        ],
      };
      const updatedConversation = { conversationId: '1', updatedAt: '2023-04-02T12:00:00Z' };
      const newData = updateConversation(
        initialData as unknown as ConversationData,
        updatedConversation as TConversation,
      );
      expect(newData.pages[0].conversations).toHaveLength(2);
      expect(newData.pages[0].conversations[0].conversationId).toBe('1');
    });
  });

  describe('updateConvoFields', () => {
    it('updates specific fields of a conversation', () => {
      const initialData = {
        pages: [
          {
            conversations: [
              { conversationId: '1', title: 'Old Title', updatedAt: '2023-04-01T12:00:00Z' },
            ],
          },
        ],
      };
      const updatedFields = { conversationId: '1', title: 'New Title' };
      const newData = updateConvoFields(
        initialData as ConversationData,
        updatedFields as TConversation,
      );
      expect(newData.pages[0].conversations[0].title).toBe('New Title');
    });
  });

  describe('deleteConversation', () => {
    it('removes a conversation by id', () => {
      const initialData = {
        pages: [
          {
            conversations: [
              { conversationId: '1', updatedAt: '2023-04-01T12:00:00Z' },
              { conversationId: '2', updatedAt: '2023-04-01T13:00:00Z' },
            ],
          },
        ],
      };
      const newData = deleteConversation(initialData as ConversationData, '1');
      expect(newData.pages[0].conversations).toHaveLength(1);
      expect(newData.pages[0].conversations[0].conversationId).not.toBe('1');
    });
  });

  describe('findPageForConversation', () => {
    it('finds the correct page and index for a given conversation', () => {
      const data = {
        pages: [
          {
            conversations: [
              { conversationId: '1', updatedAt: '2023-04-01T12:00:00Z' },
              { conversationId: '2', updatedAt: '2023-04-02T13:00:00Z' },
            ],
          },
        ],
      };
      const { pageIndex, index } = findPageForConversation(data as ConversationData, {
        conversationId: '2',
      });
      expect(pageIndex).toBe(0);
      expect(index).toBe(1);
    });
  });
});

describe('Conversation Utilities with Fake Data', () => {
  describe('groupConversationsByDate', () => {
    it('correctly groups conversations from fake data by date', () => {
      const { pages } = convoData;
      const allConversations = pages.flatMap((p) => p.conversations);
      const grouped = groupConversationsByDate(allConversations);

      expect(grouped).toHaveLength(1);
      expect(grouped[0][1]).toBeInstanceOf(Array);
    });
  });

  describe('addConversation', () => {
    it('adds a new conversation to the existing fake data', () => {
      const newConversation = {
        conversationId: 'new',
        updatedAt: new Date().toISOString(),
      } as TConversation;
      const initialLength = convoData.pages[0].conversations.length;
      const newData = addConversation(convoData, newConversation);
      expect(newData.pages[0].conversations.length).toBe(initialLength + 1);
      expect(newData.pages[0].conversations[0].conversationId).toBe('new');
    });
  });

  describe('updateConversation', () => {
    it('updates an existing conversation within fake data', () => {
      const updatedConversation = {
        ...convoData.pages[0].conversations[0],
        title: 'Updated Title',
      };
      const newData = updateConversation(convoData, updatedConversation);
      expect(newData.pages[0].conversations[0].title).toBe('Updated Title');
    });
  });

  describe('updateConvoFields', () => {
    it('updates specific fields of a conversation in fake data', () => {
      const updatedFields = {
        conversationId: convoData.pages[0].conversations[0].conversationId,
        title: 'Partially Updated Title',
      };
      const newData = updateConvoFields(convoData, updatedFields as TConversation);
      const updatedConversation = newData.pages[0].conversations.find(
        (c) => c.conversationId === updatedFields.conversationId,
      );
      expect(updatedConversation?.title).toBe('Partially Updated Title');
    });
  });

  describe('deleteConversation', () => {
    it('removes a conversation by id from fake data', () => {
      const conversationIdToDelete = convoData.pages[0].conversations[0].conversationId as string;
      const newData = deleteConversation(convoData, conversationIdToDelete);
      const deletedConvoExists = newData.pages[0].conversations.some(
        (c) => c.conversationId === conversationIdToDelete,
      );
      expect(deletedConvoExists).toBe(false);
    });
  });

  describe('findPageForConversation', () => {
    it('finds the correct page and index for a given conversation in fake data', () => {
      const targetConversation = convoData.pages[0].conversations[0];
      const { pageIndex, index } = findPageForConversation(convoData, {
        conversationId: targetConversation.conversationId as string,
      });
      expect(pageIndex).toBeGreaterThanOrEqual(0);
      expect(index).toBeGreaterThanOrEqual(0);
    });
  });

  describe('normalizeConversationData', () => {
    it('normalizes the number of items on each page after data removal', () => {
      // Create test data:
      // Generates 15 conversation items, each with a unique conversationId and an updatedAt timestamp set to a different day.
      // { conversationId: '1', updatedAt: new Date(Date.now() - 86400000 * i).toISOString() }
      const conversations = Array.from({ length: 15 }, (_, i) => ({
        conversationId: (i + 1).toString(),
        updatedAt: new Date(Date.now() - 86400000 * i).toISOString(),
      }));

      // Paginate Data:
      // Divides the 15 conversation items into pages, with each page containing up to 5 items (pageSize is set to 5). This results in 3 pages.
      const pageSize = 5;
      const totalPageNumber = Math.ceil(conversations.length / pageSize);

      const paginatedData = Array.from({ length: totalPageNumber }, (_, index) => ({
        conversations: conversations.slice(index * pageSize, (index + 1) * pageSize),
        pages: totalPageNumber,
        pageNumber: index + 1,
        pageSize,
      }));

      const testData = { pages: paginatedData, pageParams: [null, 2, 3] };

      // Removes one item from the first page, resulting in the first page having 4 items, while the second and third pages still have 5 items each.
      testData.pages[0].conversations.splice(1, 1);
      expect(testData.pages[0].conversations).toHaveLength(4);
      expect(testData.pages[1].conversations).toHaveLength(5);
      expect(testData.pages[2].conversations).toHaveLength(5);

      // Normalize Data:
      // Calls the normalizeData function to ensure that each page contains exactly 5 items, redistributing the items across the pages as needed.
      const normalizedData = normalizeData(testData, 'conversations', pageSize);

      // Verify Results:
      // Asserts that the number of conversation data is 5 except for the last page,
      // that the number of conversation data is 4 only for the last page,
      // and that the conversation ids are in the expected order.
      expect(normalizedData.pages[0].conversations).toHaveLength(5);
      expect(normalizedData.pages[0].conversations[0].conversationId).toBe('1');
      expect(normalizedData.pages[0].conversations[4].conversationId).toBe('6');

      expect(normalizedData.pages[1].conversations).toHaveLength(5);
      expect(normalizedData.pages[1].conversations[0].conversationId).toBe('7');
      expect(normalizedData.pages[1].conversations[4].conversationId).toBe('11');

      expect(normalizedData.pages[2].conversations).toHaveLength(4);
      expect(normalizedData.pages[2].conversations[0].conversationId).toBe('12');
      expect(normalizedData.pages[2].conversations[3].conversationId).toBe('15');
    });

    it('normalizes the number of items on each page after data addition', () => {
      // Create test data:
      // Generates 15 conversation items, each with a unique conversationId and an updatedAt timestamp set to a different day.
      // { conversationId: '1', updatedAt: new Date(Date.now() - 86400000 * i).toISOString() }
      const conversations = Array.from({ length: 15 }, (_, i) => ({
        conversationId: (i + 1).toString(),
        updatedAt: new Date(Date.now() - 86400000 * i).toISOString(),
      }));

      // Paginate Data:
      // Divides the 15 conversation items into pages,
      // with each page containing up to 5 items (pageSize is set to 5). This results in 3 pages.
      const pageSize = 5;
      const totalPageNumber = Math.ceil(conversations.length / pageSize);

      const paginatedData = Array.from({ length: totalPageNumber }, (_, index) => ({
        conversations: conversations.slice(index * pageSize, (index + 1) * pageSize),
        pages: totalPageNumber,
        pageNumber: index + 1,
        pageSize,
      }));

      const testData = { pages: paginatedData, pageParams: [null, 2, 3] };

      // Inserts a new conversation item at the beginning of the first page,
      testData.pages[0].conversations.unshift({
        conversationId: '16',
        updatedAt: new Date().toISOString(),
      });

      // resulting in the first page having 6 items,
      // while the second and third pages still have 5 items each.
      expect(testData.pages[0].conversations).toHaveLength(6);
      expect(testData.pages[1].conversations).toHaveLength(5);
      expect(testData.pages[2].conversations).toHaveLength(5);
      expect(testData.pages[2].conversations[4].conversationId).toBe('15');
      expect(testData.pages).toHaveLength(3);

      const normalizedData = normalizeData(testData, 'conversations', pageSize);

      // Verify Results:
      // Asserts that after normalization, each page contains the correct number of items (5 items per page).
      expect(normalizedData.pages[0].conversations).toHaveLength(5);
      expect(normalizedData.pages[1].conversations).toHaveLength(5);
      expect(normalizedData.pages[2].conversations).toHaveLength(5);
      expect(normalizedData.pages).toHaveLength(3);

      // Checks that the items are in the expected order, ensuring that the conversationId values are correctly distributed across the pages.

      expect(normalizedData.pages[0].conversations[0].conversationId).toBe('16');
      expect(normalizedData.pages[0].conversations[4].conversationId).toBe('4');

      expect(normalizedData.pages[1].conversations[0].conversationId).toBe('5');
      expect(normalizedData.pages[1].conversations[4].conversationId).toBe('9');

      expect(normalizedData.pages[2].conversations[0].conversationId).toBe('10');
      expect(normalizedData.pages[2].conversations[4].conversationId).toBe('14');
      expect(normalizedData.pageParams).toHaveLength(3);
    });

    it('returns empty data when there is no data', () => {
      const normalizedData = normalizeData(
        { pages: [{ conversations: [], pageNumber: 1, pageSize: 5, pages: 1 }], pageParams: [] },
        'conversations',
        5,
      );

      console.log(normalizedData);

      expect(normalizedData.pages[0].conversations).toHaveLength(0);
    });

    it('does not normalize data when not needed', () => {
      const normalizedData = normalizeData(
        { pages: [{ conversations: ['1'], pageNumber: 1, pageSize: 5, pages: 1 }], pageParams: [] },
        'conversations',
        5,
      );

      expect(normalizedData.pages[0].conversations).toHaveLength(1);
    });

    it('deletes pages that have no data as a result of normalization', () => {
      const conversations = Array.from({ length: 15 }, (_, i) => ({
        conversationId: (i + 1).toString(),
        updatedAt: new Date(Date.now() - 86400000 * i).toISOString(),
      }));

      const pageSize = 5;
      const totalPageNumber = Math.ceil(conversations.length / pageSize);

      const paginatedData = Array.from({ length: totalPageNumber }, (_, index) => ({
        conversations: conversations.slice(index * pageSize, (index + 1) * pageSize),
        pages: totalPageNumber,
        pageNumber: index + 1,
        pageSize,
      }));

      const testData = { pages: paginatedData, pageParams: [null, 2, 3] };

      // Removes all data from the last page, resulting in the last page having 0 items.
      testData.pages[2].conversations = [];
      expect(testData.pages[0].conversations).toHaveLength(5);
      expect(testData.pages[1].conversations).toHaveLength(5);
      expect(testData.pages[2].conversations).toHaveLength(0);
      expect(testData.pageParams).toHaveLength(3);

      const normalizedData = normalizeData(testData, 'conversations', pageSize);

      // Verify Results:
      // Asserts that the last page is removed after normalization, leaving only the first and second pages.
      expect(normalizedData.pages).toHaveLength(2);
      expect(normalizedData.pages[0].conversations).toHaveLength(5);
      expect(normalizedData.pages[1].conversations).toHaveLength(5);
      expect(normalizedData.pageParams).toHaveLength(2);
    });
  });
});
