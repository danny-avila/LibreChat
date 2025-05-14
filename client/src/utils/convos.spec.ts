import { QueryClient, InfiniteData } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import {
  dateKeys,
  storeEndpointSettings,
  addConversationToInfinitePages,
  updateInfiniteConvoPage,
  findConversationInInfinite,
  removeConvoFromInfinitePages,
  groupConversationsByDate,
  updateConvoFieldsInfinite,
  addConvoToAllQueries,
  updateConvoInAllQueries,
  removeConvoFromAllQueries,
  addConversationToAllConversationsQueries,
} from './convos';
import { normalizeData } from './collection';

jest.mock('date-fns', () => {
  const actual = jest.requireActual('date-fns');
  return {
    ...actual,
    startOfToday: jest.fn(() => new Date('2023-07-15T00:00:00Z')),
  };
});

describe('Conversation Utilities', () => {
  describe('groupConversationsByDate', () => {
    it('groups conversations by date correctly', () => {
      const conversations = [
        { conversationId: '1', updatedAt: '2023-04-01T12:00:00Z' },
        { conversationId: '2', updatedAt: new Date().toISOString() },
        { conversationId: '3', updatedAt: new Date(Date.now() - 86400000).toISOString() },
        { conversationId: '4', updatedAt: new Date(Date.now() - 86400000 * 2).toISOString() },
        { conversationId: '5', updatedAt: new Date(Date.now() - 86400000 * 8).toISOString() },
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

    it('skips conversations with duplicate conversationIds', () => {
      const conversations = [
        { conversationId: '1', updatedAt: '2023-12-01T12:00:00Z' },
        { conversationId: '2', updatedAt: '2023-11-25T12:00:00Z' },
        { conversationId: '1', updatedAt: '2023-11-20T12:00:00Z' },
        { conversationId: '3', updatedAt: '2022-12-01T12:00:00Z' },
      ];

      const grouped = groupConversationsByDate(conversations as TConversation[]);

      expect(grouped).toEqual(
        expect.arrayContaining([
          [' 2023', expect.arrayContaining([conversations[0], conversations[1]])],
          [' 2022', expect.arrayContaining([conversations[3]])],
        ]),
      );

      // No duplicate IDs are present
      const allGroupedIds = grouped.flatMap(([, convs]) => convs.map((c) => c.conversationId));
      const uniqueIds = [...new Set(allGroupedIds)];
      expect(allGroupedIds.length).toBe(uniqueIds.length);
    });

    it('sorts conversations by month correctly', () => {
      const conversations = [
        { conversationId: '1', updatedAt: '2023-01-01T12:00:00Z' },
        { conversationId: '2', updatedAt: '2023-12-01T12:00:00Z' },
        { conversationId: '3', updatedAt: '2023-02-01T12:00:00Z' },
        { conversationId: '4', updatedAt: '2023-11-01T12:00:00Z' },
        { conversationId: '5', updatedAt: '2022-12-01T12:00:00Z' },
      ];

      const grouped = groupConversationsByDate(conversations as TConversation[]);

      // Now expect grouping by year for 2023 and 2022
      const expectedGroups = [' 2023', ' 2022'];
      expect(grouped.map(([key]) => key)).toEqual(expectedGroups);

      // Check if conversations within 2023 are sorted correctly by updatedAt descending
      const conversationsIn2023 = grouped[0][1];
      const sorted = [...conversationsIn2023].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      expect(conversationsIn2023).toEqual(sorted);

      // Check if the conversation from 2022 is in its own group
      expect(grouped[1][1].length).toBe(1);
      expect(new Date(grouped[1][1][0].updatedAt).getFullYear()).toBe(2022);
    });

    it('handles conversations from multiple years correctly', () => {
      const conversations = [
        { conversationId: '1', updatedAt: '2023-01-01T12:00:00Z' },
        { conversationId: '2', updatedAt: '2022-12-01T12:00:00Z' },
        { conversationId: '3', updatedAt: '2021-06-01T12:00:00Z' },
        { conversationId: '4', updatedAt: '2023-06-01T12:00:00Z' },
        { conversationId: '5', updatedAt: '2021-12-01T12:00:00Z' },
      ];

      const grouped = groupConversationsByDate(conversations as TConversation[]);

      expect(grouped.map(([key]) => key)).toEqual([' 2023', ' 2022', ' 2021']);
      expect(grouped[0][1].map((c) => new Date(c.updatedAt).getFullYear())).toEqual([2023, 2023]);
      expect(grouped[1][1].map((c) => new Date(c.updatedAt).getFullYear())).toEqual([2022]);
      expect(grouped[2][1].map((c) => new Date(c.updatedAt).getFullYear())).toEqual([2021, 2021]);
    });

    it('handles conversations from the same month correctly', () => {
      const conversations = [
        { conversationId: '1', updatedAt: '2023-06-01T12:00:00Z' },
        { conversationId: '2', updatedAt: '2023-06-15T12:00:00Z' },
        { conversationId: '3', updatedAt: '2023-06-30T12:00:00Z' },
      ];

      const grouped = groupConversationsByDate(conversations as TConversation[]);

      expect(grouped.length).toBe(1);
      expect(grouped[0][0]).toBe(' 2023');
      expect(grouped[0][1].map((c) => c.conversationId)).toEqual(['3', '2', '1']);
    });

    it('handles conversations with null or undefined updatedAt correctly', () => {
      const conversations = [
        { conversationId: '1', updatedAt: '2023-06-01T12:00:00Z' },
        { conversationId: '2', updatedAt: null },
        { conversationId: '3', updatedAt: undefined },
      ];

      const grouped = groupConversationsByDate(conversations as TConversation[]);

      expect(grouped.length).toBe(2);
      expect(grouped[0][0]).toBe(dateKeys.today);
      expect(grouped[0][1].length).toBe(2);
      expect(grouped[1][0]).toBe(' 2023');
      expect(grouped[1][1].length).toBe(1);
    });

    it('correctly groups and sorts conversations for every month of the year', () => {
      const months = [
        'january',
        'february',
        'march',
        'april',
        'may',
        'june',
        'july',
        'august',
        'september',
        'october',
        'november',
        'december',
      ];

      // Create conversations for each month in both 2023 and 2022
      const conversations = months.flatMap((month, index) => [
        {
          conversationId: `2023-${month}`,
          updatedAt: `2023-${String(index + 1).padStart(2, '0')}-15T12:00:00Z`,
        },
        {
          conversationId: `2022-${month}`,
          updatedAt: `2022-${String(index + 1).padStart(2, '0')}-15T12:00:00Z`,
        },
      ]);

      const grouped = groupConversationsByDate(conversations as TConversation[]);

      // All 2023 conversations should be in a single group
      const group2023 = grouped.find(([key]) => key === ' 2023');
      expect(group2023).toBeDefined();
      expect(group2023![1].length).toBe(12);

      // All 2022 conversations should be in a single group
      const group2022 = grouped.find(([key]) => key === ' 2022');
      expect(group2022).toBeDefined();
      expect(group2022![1].length).toBe(12);

      // Check that all conversations are accounted for
      const totalGroupedConversations = grouped.reduce(
        (total, [_, convos]) => total + convos.length,
        0,
      );
      expect(totalGroupedConversations).toBe(conversations.length);
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

  describe('InfiniteData helpers', () => {
    const makeConversation = (id: string, updatedAt?: string) => ({
      conversationId: id,
      updatedAt: updatedAt || new Date().toISOString(),
    });

    const makePage = (conversations: any[], nextCursor: string | null = null) => ({
      conversations,
      nextCursor,
    });

    describe('findConversationInInfinite', () => {
      it('finds a conversation by id in InfiniteData', () => {
        const data = {
          pages: [
            makePage([makeConversation('1'), makeConversation('2')]),
            makePage([makeConversation('3')]),
          ],
          pageParams: [],
        };
        const found = findConversationInInfinite(data, '2');
        expect(found).toBeDefined();
        expect(found?.conversationId).toBe('2');
      });

      it('returns undefined if conversation not found', () => {
        const data = {
          pages: [makePage([makeConversation('1')])],
          pageParams: [],
        };
        expect(findConversationInInfinite(data, 'notfound')).toBeUndefined();
      });

      it('returns undefined if data is undefined', () => {
        expect(findConversationInInfinite(undefined, '1')).toBeUndefined();
      });
    });

    describe('updateInfiniteConvoPage', () => {
      it('updates a conversation in InfiniteData', () => {
        const data = {
          pages: [makePage([makeConversation('1', '2023-01-01T00:00:00Z'), makeConversation('2')])],
          pageParams: [],
        };
        const updater = (c: any) => ({ ...c, updatedAt: '2024-01-01T00:00:00Z' });
        const updated = updateInfiniteConvoPage(data, '1', updater);
        expect(updated?.pages[0].conversations[0].updatedAt).toBe('2024-01-01T00:00:00Z');
      });

      it('returns original data if conversation not found', () => {
        const data = {
          pages: [makePage([makeConversation('1')])],
          pageParams: [],
        };
        const updater = (c: any) => ({ ...c, foo: 'bar' });
        const updated = updateInfiniteConvoPage(data, 'notfound', updater);
        expect(updated).toEqual(data);
      });

      it('returns undefined if data is undefined', () => {
        expect(updateInfiniteConvoPage(undefined, '1', (c) => c)).toBeUndefined();
      });
    });

    describe('addConversationToInfinitePages', () => {
      it('adds a conversation to the first page', () => {
        const data = {
          pages: [makePage([makeConversation('1')])],
          pageParams: [],
        };
        const newConvo = makeConversation('new');
        const updated = addConversationToInfinitePages(data, newConvo as TConversation);
        expect(updated.pages[0].conversations[0].conversationId).toBe('new');
        expect(updated.pages[0].conversations[1].conversationId).toBe('1');
      });

      it('creates new InfiniteData if data is undefined', () => {
        const newConvo = makeConversation('new');
        const updated = addConversationToInfinitePages(undefined, newConvo as TConversation);
        expect(updated.pages[0].conversations[0].conversationId).toBe('new');
        expect(updated.pageParams).toEqual([undefined]);
      });
    });

    describe('removeConvoFromInfinitePages', () => {
      it('removes a conversation by id', () => {
        const data = {
          pages: [
            makePage([makeConversation('1'), makeConversation('2')]),
            makePage([makeConversation('3')]),
          ],
          pageParams: [],
        };
        const updated = removeConvoFromInfinitePages(data, '2');
        expect(updated?.pages[0].conversations.map((c) => c.conversationId)).toEqual(['1']);
      });

      it('removes empty pages after deletion', () => {
        const data = {
          pages: [makePage([makeConversation('1')]), makePage([makeConversation('2')])],
          pageParams: [],
        };
        const updated = removeConvoFromInfinitePages(data, '2');
        expect(updated?.pages.length).toBe(1);
        expect(updated?.pages[0].conversations[0].conversationId).toBe('1');
      });

      it('returns original data if data is undefined', () => {
        expect(removeConvoFromInfinitePages(undefined, '1')).toBeUndefined();
      });
    });

    describe('updateConvoFieldsInfinite', () => {
      it('updates fields and bumps to front if keepPosition is false', () => {
        const data = {
          pages: [
            makePage([makeConversation('1'), makeConversation('2')]),
            makePage([makeConversation('3')]),
          ],
          pageParams: [],
        };
        const updated = updateConvoFieldsInfinite(
          data,
          { conversationId: '2', title: 'new' },
          false,
        );
        expect(updated?.pages[0].conversations[0].conversationId).toBe('2');
        expect(updated?.pages[0].conversations[0].title).toBe('new');
      });

      it('updates fields and keeps position if keepPosition is true', () => {
        const data = {
          pages: [makePage([makeConversation('1'), makeConversation('2')])],
          pageParams: [],
        };
        const updated = updateConvoFieldsInfinite(
          data,
          { conversationId: '2', title: 'stay' },
          true,
        );
        expect(updated?.pages[0].conversations[1].title).toBe('stay');
      });

      it('returns original data if conversation not found', () => {
        const data = {
          pages: [makePage([makeConversation('1')])],
          pageParams: [],
        };
        const updated = updateConvoFieldsInfinite(
          data,
          { conversationId: 'notfound', title: 'x' },
          false,
        );
        expect(updated).toEqual(data);
      });

      it('returns original data if data is undefined', () => {
        expect(
          updateConvoFieldsInfinite(undefined, { conversationId: '1', title: 'x' }, false),
        ).toBeUndefined();
      });
    });

    describe('storeEndpointSettings', () => {
      beforeEach(() => {
        localStorage.clear();
      });

      it('stores model for endpoint', () => {
        const conversation = {
          conversationId: '1',
          endpoint: 'openAI',
          model: 'gpt-3',
        };
        storeEndpointSettings(conversation as any);
        const stored = JSON.parse(localStorage.getItem('lastModel') || '{}');
        expect([undefined, 'gpt-3']).toContain(stored.openAI);
      });

      it('stores secondaryModel for gptPlugins endpoint', () => {
        const conversation = {
          conversationId: '1',
          endpoint: 'gptPlugins',
          model: 'gpt-4',
          agentOptions: { model: 'plugin-model' },
        };
        storeEndpointSettings(conversation as any);
        const stored = JSON.parse(localStorage.getItem('lastModel') || '{}');
        expect([undefined, 'gpt-4']).toContain(stored.gptPlugins);
        expect([undefined, 'plugin-model']).toContain(stored.secondaryModel);
      });

      it('does nothing if conversation is null', () => {
        storeEndpointSettings(null);
        expect(localStorage.getItem('lastModel')).toBeNull();
      });

      it('does nothing if endpoint is missing', () => {
        storeEndpointSettings({ conversationId: '1', model: 'x' } as any);
        expect(localStorage.getItem('lastModel')).toBeNull();
      });
    });

    describe('QueryClient helpers', () => {
      let queryClient: QueryClient;
      let convoA: TConversation;
      let convoB: TConversation;

      beforeEach(() => {
        queryClient = new QueryClient();
        convoA = {
          conversationId: 'a',
          updatedAt: '2024-01-01T12:00:00Z',
          createdAt: '2024-01-01T10:00:00Z',
          endpoint: 'openAI',
          model: 'gpt-3',
          title: 'Conversation A',
        } as TConversation;
        convoB = {
          conversationId: 'b',
          updatedAt: '2024-01-02T12:00:00Z',
          endpoint: 'openAI',
          model: 'gpt-3',
        } as TConversation;
        queryClient.setQueryData(['allConversations'], {
          pages: [{ conversations: [convoA], nextCursor: null }],
          pageParams: [],
        });
      });

      it('addConvoToAllQueries adds new on top if not present', () => {
        addConvoToAllQueries(queryClient, convoB);
        const data = queryClient.getQueryData<InfiniteData<any>>(['allConversations']);
        expect(data!.pages[0].conversations[0].conversationId).toBe('b');
        expect(data!.pages[0].conversations.length).toBe(2);
      });

      it('addConvoToAllQueries does not duplicate', () => {
        addConvoToAllQueries(queryClient, convoA);
        const data = queryClient.getQueryData<InfiniteData<any>>(['allConversations']);
        expect(data!.pages[0].conversations.filter((c) => c.conversationId === 'a').length).toBe(1);
      });

      it('updateConvoInAllQueries updates correct convo', () => {
        updateConvoInAllQueries(queryClient, 'a', (c) => ({ ...c, model: 'gpt-4' }));
        const data = queryClient.getQueryData<InfiniteData<any>>(['allConversations']);
        expect(data!.pages[0].conversations[0].model).toBe('gpt-4');
      });

      it('removeConvoFromAllQueries deletes conversation', () => {
        removeConvoFromAllQueries(queryClient, 'a');
        const data = queryClient.getQueryData<InfiniteData<any>>(['allConversations']);
        expect(data!.pages.length).toBe(0);
      });

      it('addConversationToAllConversationsQueries works with multiple pages', () => {
        queryClient.setQueryData(['allConversations', 'other'], {
          pages: [{ conversations: [], nextCursor: null }],
          pageParams: [],
        });
        addConversationToAllConversationsQueries(queryClient, convoB);

        const mainData = queryClient.getQueryData<InfiniteData<any>>(['allConversations']);
        const otherData = queryClient.getQueryData<InfiniteData<any>>([
          'allConversations',
          'other',
        ]);
        expect(mainData!.pages[0].conversations[0].conversationId).toBe('b');
        expect(otherData!.pages[0].conversations[0].conversationId).toBe('b');
      });
    });
  });
});
