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
      const { pageIndex, convIndex } = findPageForConversation(data as ConversationData, {
        conversationId: '2',
      });
      expect(pageIndex).toBe(0);
      expect(convIndex).toBe(1);
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
      const { pageIndex, convIndex } = findPageForConversation(convoData, {
        conversationId: targetConversation.conversationId as string,
      });
      expect(pageIndex).toBeGreaterThanOrEqual(0);
      expect(convIndex).toBeGreaterThanOrEqual(0);
    });
  });
});
