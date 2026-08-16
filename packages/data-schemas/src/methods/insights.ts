import {
  INSIGHTS_MAX_RANGE_DAYS,
  INSIGHTS_SEARCH_MAX_LENGTH,
  INSIGHTS_SEARCH_MIN_LENGTH,
} from 'librechat-data-provider';
import type {
  TInsightsResponse,
  TInsightsParams,
  TInsightsDailyPoint,
  TInsightsUser,
  TInsightsChurnedUser,
  TInsightsConversation,
} from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { IConversation, IMessage, IUser } from '~/types';

export type InsightsOptions = TInsightsParams & {
  tenantId?: string;
};

export type InsightsResult = TInsightsResponse;

export type InsightsMethods = {
  getInsights: (options?: InsightsOptions) => Promise<InsightsResult>;
};

type ConversationFacet = {
  conversationCount: Array<{ total: number }>;
  daily: Array<{ date: string; conversations: number }>;
  recentConversations?: RecentConversation[];
};

type ConversationListFacet = Pick<ConversationFacet, 'conversationCount' | 'recentConversations'>;

type MessageFacet = {
  totals: MessageTotals[];
  daily: MessageDay[];
  userCount: Array<{ total: number }>;
  dailyUsers: Array<{ date: string; users: number }>;
  topUsers: MessageSummary[];
};

type UserMessageTotals = {
  messages: number;
};

type RecentConversation = {
  conversationId: string;
  date: Date;
  userId: string;
};

type MessageSummary = {
  _id: string;
  messages: number;
};

type MessageTotals = {
  messages: number;
  totalTokens: number;
};

type ChurnedUserActivity = {
  _id: string;
  lastSeen: Date;
};

type ChurnedUserSummary = UserMessageTotals & {
  _id: string;
  conversations: number;
  firstSeen: Date;
};

type ConversationOwner = {
  conversationId: string;
  userId: string;
};

type ConversationMessageSummary = UserMessageTotals & {
  _id: ConversationOwner;
  totalTokens: number;
};

type UserConversationCount = {
  _id: string;
  conversations: number;
};

type MessageDay = {
  date: string;
  messages: number;
  totalTokens: number;
};

type FirstMessage = {
  _id: ConversationOwner;
  text: string;
};

type UserSummary = {
  _id: { toString(): string };
  name?: string;
  username?: string;
  email?: string;
};

const rangeDays = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
};

const defaultRange = '7d';
const churnedUserWindowDays = 28;
const churnedUserLimit = 8;
const dayMs = 24 * 60 * 60 * 1000;
function tenantMatch(tenantId?: string) {
  return tenantId ? { tenantId } : { tenantId: { $exists: false } };
}

function validTimeZone(timeZone?: string) {
  if (!timeZone) {
    return 'UTC';
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function dateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

function dateKeyValue(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function addCalendarDaysToKey(key: string, days: number) {
  const date = new Date(dateKeyValue(key));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarDayDifference(startKey: string, endKey: string) {
  return Math.round((dateKeyValue(endKey) - dateKeyValue(startKey)) / dayMs);
}

function startOfZonedDate(key: string, timeZone: string) {
  const target = dateKeyValue(key);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  });

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Map(
      formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
    );
    const rendered = Date.UTC(
      Number(parts.get('year')),
      Number(parts.get('month')) - 1,
      Number(parts.get('day')),
      Number(parts.get('hour')),
      Number(parts.get('minute')),
      Number(parts.get('second')),
    );
    instant += target - rendered;
  }
  return new Date(instant);
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const conversationOwnerKey = ({ conversationId, userId }: ConversationOwner): string =>
  JSON.stringify([conversationId, userId]);

const conversationOwnerMatch = ({ conversationId, userId }: ConversationOwner) => ({
  conversationId,
  user: userId,
});

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function resolveRange(options: InsightsOptions) {
  const now = new Date();
  const range = options.range ?? defaultRange;

  if (range === 'custom' && options.fromTimestamp && options.toTimestamp) {
    const customFrom = new Date(options.fromTimestamp);
    const customTo = new Date(options.toTimestamp);
    if (Number.isFinite(customFrom.getTime()) && Number.isFinite(customTo.getTime())) {
      const [start, end] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
      const timeZone = validTimeZone(options.timeZone);
      const startKey = dateKey(start, timeZone);
      const endKey = dateKey(end, timeZone);
      if (calendarDayDifference(startKey, endKey) < INSIGHTS_MAX_RANGE_DAYS) {
        return { from: start, to: end };
      }
      const firstAllowedKey = addCalendarDaysToKey(endKey, -(INSIGHTS_MAX_RANGE_DAYS - 1));
      return { from: startOfZonedDate(firstAllowedKey, timeZone), to: end };
    }
  }

  const days = rangeDays[range as keyof typeof rangeDays] ?? rangeDays[defaultRange];
  return { from: new Date(now.getTime() - days * dayMs), to: now };
}

const addDay = (days: Map<string, TInsightsDailyPoint>, date: string): TInsightsDailyPoint => {
  const current = days.get(date) ?? {
    date,
    conversations: 0,
    users: 0,
    messages: 0,
    totalTokens: 0,
  };
  days.set(date, current);
  return current;
};

const toUser = (
  userId: string,
  conversations: number,
  users: Map<string, UserSummary>,
  messageSummary: UserMessageTotals | undefined,
): TInsightsUser => {
  const user = users.get(userId);
  return {
    userId,
    name: user?.name || user?.username || '',
    email: user?.email ?? '',
    conversations,
    messages: messageSummary?.messages ?? 0,
  };
};

export function createInsightsMethods(mongoose: typeof import('mongoose')): InsightsMethods {
  async function getInsights(options: InsightsOptions = {}): Promise<InsightsResult> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const Message = mongoose.models.Message as Model<IMessage>;
    const User = mongoose.models.User as Model<IUser>;
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(50, Math.max(5, Math.floor(options.pageSize ?? 10)));
    const { from, to } = resolveRange(options);
    const timeZone = validTimeZone(options.timeZone);
    const churnedCutoff = new Date(to.getTime() - churnedUserWindowDays * dayMs);
    const churnedActivityFrom = new Date(from.getTime() - churnedUserWindowDays * dayMs);
    const tenant = tenantMatch(options.tenantId);
    const tenantConversations = {
      ...tenant,
      isTemporary: { $ne: true },
    };
    const conversationMatch = {
      ...tenantConversations,
      user: { $nin: [null, ''] },
      createdAt: { $gte: from, $lte: to },
    };
    const messageMatch = {
      ...tenant,
      user: { $nin: [null, ''] },
      isTemporary: { $ne: true },
      createdAt: { $gte: from, $lte: to },
    };
    const conversationScope = [{ $match: conversationMatch }];
    const messageScope = [{ $match: messageMatch }];

    const requestedSearch = options.search?.trim().slice(0, INSIGHTS_SEARCH_MAX_LENGTH) ?? '';
    const search = requestedSearch.length >= INSIGHTS_SEARCH_MIN_LENGTH ? requestedSearch : '';
    const searchRegex = search ? new RegExp(escapeRegex(search), 'i') : undefined;
    const searchedConversationAggregation = searchRegex
      ? Conversation.aggregate<ConversationListFacet>([
          { $match: conversationMatch },
          {
            $addFields: {
              insightsUserId: {
                $convert: { input: '$user', to: 'objectId', onError: null, onNull: null },
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: 'insightsUserId',
              foreignField: '_id',
              as: 'matchedIdentity',
            },
          },
          {
            $match: {
              $or: [
                { conversationId: searchRegex },
                { user: searchRegex },
                {
                  matchedIdentity: {
                    $elemMatch: {
                      ...(options.tenantId
                        ? { tenantId: options.tenantId }
                        : { tenantId: { $exists: false } }),
                      $or: [
                        { name: searchRegex },
                        { username: searchRegex },
                        { email: searchRegex },
                      ],
                    },
                  },
                },
              ],
            },
          },
          {
            $facet: {
              conversationCount: [{ $count: 'total' }],
              recentConversations: [
                { $sort: { createdAt: -1, _id: -1 } },
                { $skip: (page - 1) * pageSize },
                { $limit: pageSize },
                {
                  $project: {
                    _id: 0,
                    conversationId: 1,
                    date: '$createdAt',
                    userId: '$user',
                  },
                },
              ],
            },
          },
        ])
      : Promise.resolve([] as ConversationListFacet[]);

    const insightsAggregations = await Promise.all([
      Conversation.aggregate<ConversationFacet>([
        ...conversationScope,
        {
          $facet: {
            conversationCount: [{ $count: 'total' }],
            daily: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: timeZone,
                    },
                  },
                  conversations: { $sum: 1 },
                },
              },
              { $project: { _id: 0, date: '$_id', conversations: 1 } },
              { $sort: { date: 1 } },
            ],
            ...(searchRegex
              ? {}
              : {
                  recentConversations: [
                    { $sort: { createdAt: -1, _id: -1 } },
                    { $skip: (page - 1) * pageSize },
                    { $limit: pageSize },
                    {
                      $project: {
                        _id: 0,
                        conversationId: 1,
                        date: '$createdAt',
                        userId: '$user',
                      },
                    },
                  ],
                }),
          },
        },
      ]),
      Message.aggregate<MessageFacet>([
        ...messageScope,
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: 'all',
                  messages: { $sum: 1 },
                  totalTokens: { $sum: { $ifNull: ['$tokenCount', 0] } },
                },
              },
            ],
            daily: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: timeZone,
                    },
                  },
                  messages: { $sum: 1 },
                  totalTokens: { $sum: { $ifNull: ['$tokenCount', 0] } },
                },
              },
              { $project: { _id: 0, date: '$_id', messages: 1, totalTokens: 1 } },
              { $sort: { date: 1 } },
            ],
            userCount: [
              { $match: { user: { $nin: [null, ''] }, isCreatedByUser: true } },
              { $group: { _id: '$user' } },
              { $count: 'total' },
            ],
            dailyUsers: [
              { $match: { user: { $nin: [null, ''] }, isCreatedByUser: true } },
              {
                $group: {
                  _id: {
                    date: {
                      $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$createdAt',
                        timezone: timeZone,
                      },
                    },
                    user: '$user',
                  },
                },
              },
              { $group: { _id: '$_id.date', users: { $sum: 1 } } },
              { $project: { _id: 0, date: '$_id', users: 1 } },
              { $sort: { date: 1 } },
            ],
            topUsers: [
              { $match: { user: { $nin: [null, ''] } } },
              {
                $group: {
                  _id: '$user',
                  messages: { $sum: 1 },
                },
              },
              { $sort: { messages: -1, _id: 1 } },
              { $limit: 8 },
            ],
          },
        },
      ]),
      Message.aggregate<ChurnedUserActivity>([
        {
          $match: {
            ...tenant,
            isTemporary: { $ne: true },
            user: { $nin: [null, ''] },
            isCreatedByUser: true,
            createdAt: { $gte: churnedActivityFrom, $lte: to },
          },
        },
        {
          $group: {
            _id: '$user',
            lastSeen: { $max: '$createdAt' },
          },
        },
        { $match: { lastSeen: { $gte: churnedActivityFrom, $lte: churnedCutoff } } },
        { $sort: { lastSeen: -1, _id: 1 } },
        { $limit: churnedUserLimit },
      ]),
      searchedConversationAggregation,
    ]);
    const [conversationFacets, messageFacets, churnedUserRows, searchedConversationFacets] =
      insightsAggregations;

    const conversationFacet = conversationFacets[0];
    const conversationListFacet = searchRegex ? searchedConversationFacets[0] : conversationFacet;
    const messageFacet = messageFacets[0];
    const messageTotals = messageFacet?.totals ?? [];
    const topMessageUsers = messageFacet?.topUsers ?? [];
    const latestRows = conversationListFacet?.recentConversations ?? [];
    const latestConversationOwners = latestRows
      .filter(
        (row): row is RecentConversation & { userId: string } =>
          isNonEmptyString(row.conversationId) && isNonEmptyString(row.userId),
      )
      .map(({ conversationId, userId }) => ({ conversationId, userId }));
    const latestConversationIds = [
      ...new Set(latestConversationOwners.map(({ conversationId }) => conversationId)),
    ];
    const latestConversationMatches = latestConversationOwners.map(conversationOwnerMatch);
    const topUserIds = topMessageUsers.map(({ _id }) => _id);
    const churnedUserIds = churnedUserRows.map(({ _id }) => _id);
    const userIds = new Set<string>([
      ...topUserIds,
      ...churnedUserIds,
      ...latestRows.map(({ userId }) => userId).filter(isNonEmptyString),
    ]);

    const [
      latestMessageSummaries,
      firstMessages,
      topConversationCounts,
      churnedUserSummaries,
      userRows,
    ] = await Promise.all([
      latestConversationMatches.length === 0
        ? Promise.resolve([] as ConversationMessageSummary[])
        : Message.aggregate<ConversationMessageSummary>([
            {
              $match: {
                ...tenant,
                isTemporary: { $ne: true },
                conversationId: { $in: latestConversationIds },
                $or: latestConversationMatches,
                createdAt: { $gte: from, $lte: to },
              },
            },
            {
              $group: {
                _id: { conversationId: '$conversationId', userId: '$user' },
                messages: { $sum: 1 },
                totalTokens: { $sum: { $ifNull: ['$tokenCount', 0] } },
              },
            },
          ]),
      latestConversationMatches.length === 0
        ? Promise.resolve([] as FirstMessage[])
        : Message.aggregate<FirstMessage>([
            {
              $match: {
                ...tenant,
                isTemporary: { $ne: true },
                conversationId: { $in: latestConversationIds },
                $or: latestConversationMatches,
                isCreatedByUser: true,
              },
            },
            { $sort: { createdAt: 1, _id: 1 } },
            {
              $group: {
                _id: { conversationId: '$conversationId', userId: '$user' },
                text: { $first: { $ifNull: ['$text', ''] } },
              },
            },
          ]),
      topUserIds.length === 0
        ? Promise.resolve([] as UserConversationCount[])
        : Message.aggregate<UserConversationCount>([
            {
              $match: {
                ...messageMatch,
                user: { $in: topUserIds },
                isCreatedByUser: true,
              },
            },
            {
              $group: {
                _id: { user: '$user', conversationId: '$conversationId' },
              },
            },
            {
              $group: {
                _id: '$_id.user',
                conversations: { $sum: 1 },
              },
            },
          ]),
      churnedUserIds.length === 0
        ? Promise.resolve([] as ChurnedUserSummary[])
        : Message.aggregate<ChurnedUserSummary>([
            {
              $match: {
                ...tenant,
                isTemporary: { $ne: true },
                user: { $in: churnedUserIds },
                createdAt: { $lte: to },
              },
            },
            {
              $group: {
                _id: { user: '$user', conversationId: '$conversationId' },
                messages: { $sum: 1 },
                firstSeen: { $min: '$createdAt' },
              },
            },
            {
              $group: {
                _id: '$_id.user',
                conversations: { $sum: 1 },
                messages: { $sum: '$messages' },
                firstSeen: { $min: '$firstSeen' },
              },
            },
          ]),
      userIds.size === 0
        ? Promise.resolve([] as UserSummary[])
        : User.find({ ...tenant, _id: { $in: [...userIds] } })
            .select('_id name username email')
            .lean<UserSummary[]>(),
    ]);

    const users = new Map(userRows.map((user) => [user._id.toString(), user]));
    const latestSummaries = new Map(
      latestMessageSummaries.map((summary) => [conversationOwnerKey(summary._id), summary]),
    );
    const firstByConversation = new Map(
      firstMessages.map((message) => [conversationOwnerKey(message._id), message.text]),
    );
    const days = new Map<string, TInsightsDailyPoint>();
    const firstDay = dateKey(from, timeZone);
    const lastDay = dateKey(to, timeZone);
    for (let key = firstDay; key <= lastDay; key = addCalendarDaysToKey(key, 1)) {
      addDay(days, key);
    }
    for (const row of conversationFacet?.daily ?? []) {
      const day = addDay(days, row.date);
      day.conversations = row.conversations;
    }
    for (const row of messageFacet?.daily ?? []) {
      const day = addDay(days, row.date);
      day.messages = row.messages;
      day.totalTokens = row.totalTokens;
    }
    for (const row of messageFacet?.dailyUsers ?? []) {
      const day = addDay(days, row.date);
      day.users = row.users;
    }

    const totalConversations = conversationFacet?.conversationCount[0]?.total ?? 0;
    const matchingConversations = conversationListFacet?.conversationCount[0]?.total ?? 0;
    const totalMessages = messageTotals[0]?.messages ?? 0;
    const totalTokens = messageTotals[0]?.totalTokens ?? 0;
    const topConversationCountsByUser = new Map(
      topConversationCounts.map((summary) => [summary._id, summary.conversations]),
    );
    const churnedSummariesByUser = new Map(
      churnedUserSummaries.map((summary) => [summary._id, summary]),
    );

    return {
      summary: {
        totalUsers: messageFacet?.userCount[0]?.total ?? 0,
        totalConversations,
        totalMessages,
        totalTokens,
      },
      daily: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
      topUsers: topMessageUsers.map((row) =>
        toUser(row._id, topConversationCountsByUser.get(row._id) ?? 0, users, row),
      ),
      churnedUsers: churnedUserRows.map((row): TInsightsChurnedUser => {
        const user = users.get(row._id);
        const summary = churnedSummariesByUser.get(row._id);
        return {
          userId: row._id,
          name: user?.name || user?.username || '',
          email: user?.email ?? '',
          conversations: summary?.conversations ?? 0,
          messages: summary?.messages ?? 0,
          firstSeen: summary?.firstSeen.toISOString() ?? row.lastSeen.toISOString(),
          lastSeen: row.lastSeen.toISOString(),
        };
      }),
      latest: {
        conversations: latestRows.map((row): TInsightsConversation => {
          const userId = isNonEmptyString(row.userId) ? row.userId : '';
          const user = userId ? users.get(userId) : undefined;
          const ownerKey = conversationOwnerKey({ conversationId: row.conversationId, userId });
          const summary = latestSummaries.get(ownerKey);
          return {
            ...row,
            userId,
            date: row.date.toISOString(),
            name: user?.name || user?.username || '',
            email: user?.email ?? '',
            firstMessage: firstByConversation.get(ownerKey) ?? '',
            messages: summary?.messages ?? 0,
            totalTokens: summary?.totalTokens ?? 0,
          };
        }),
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(matchingConversations / pageSize)),
      },
    };
  }

  return { getInsights };
}
