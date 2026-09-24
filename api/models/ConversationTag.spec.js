const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('~/server/services/Config/app');
jest.mock('./Message');

const { getConversationTags, updateTagsForConversation } = require('./ConversationTag');
const { softDeleteConvos, getConvosByCursor } = require('./Conversation');
const { Conversation, ConversationTag } = require('~/db/models');

const USER = 'user123';

/**
 * BKL: 북마크 배지 건수가 조회 시점 집계로 계산되는지 검증한다.
 * 저장된 `count` 가 실제 대화 수와 벌어지는 것이 원래 버그였으므로,
 * 각 테스트는 일부러 저장값을 틀리게 심어 두고 응답이 실제 값인지 본다.
 */
describe('getConversationTags — derived counts', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Conversation.deleteMany({});
    await ConversationTag.deleteMany({});
  });

  /** 저장된 count 를 의도적으로 틀린 값으로 심는다. */
  const seedTag = async (tag, storedCount, position = 1) => {
    await ConversationTag.create({ user: USER, tag, count: storedCount, position });
  };

  const seedConvo = async (tags, extra = {}) => {
    const conversationId = uuidv4();
    await Conversation.create({
      conversationId,
      user: USER,
      endpoint: 'openAI',
      title: 'convo',
      tags,
      ...extra,
    });
    return conversationId;
  };

  const countOf = async (tag) => {
    const tags = await getConversationTags(USER);
    return tags.find((t) => t.tag === tag)?.count;
  };

  test('저장값이 아니라 실제 대화 수를 반환한다', async () => {
    await seedTag('건설', 31);
    await seedConvo(['건설']);
    await seedConvo(['건설']);

    expect(await countOf('건설')).toBe(2);
  });

  test('소프트 삭제된 대화는 제외한다', async () => {
    await seedTag('NEW', 0);
    const keep = await seedConvo(['NEW']);
    const drop = await seedConvo(['NEW']);

    expect(await countOf('NEW')).toBe(2);

    await softDeleteConvos(USER, { conversationId: drop });

    expect(await countOf('NEW')).toBe(1);
    expect(keep).toBeDefined();
  });

  test('아카이브된 대화는 제외한다', async () => {
    await seedTag('test', 2);
    await seedConvo(['test']);
    await seedConvo(['test'], { isArchived: true });

    expect(await countOf('test')).toBe(1);
  });

  test('만료된 임시 대화는 제외한다', async () => {
    await seedTag('임시', 5);
    await seedConvo(['임시']);
    await seedConvo(['임시'], { expiredAt: new Date('2020-01-01') });

    expect(await countOf('임시')).toBe(1);
  });

  test('대화가 없는 북마크는 0 을 반환한다', async () => {
    await seedTag('중요', 6);

    expect(await countOf('중요')).toBe(0);
  });

  test('다른 사용자의 대화는 세지 않는다', async () => {
    await seedTag('공유', 0);
    await seedConvo(['공유']);
    await Conversation.create({
      conversationId: uuidv4(),
      user: 'otherUser',
      endpoint: 'openAI',
      tags: ['공유'],
    });

    expect(await countOf('공유')).toBe(1);
  });

  test('한 대화에 여러 북마크가 걸리면 각각 세어진다', async () => {
    await seedTag('A', 0, 1);
    await seedTag('B', 0, 2);
    await seedConvo(['A', 'B']);
    await seedConvo(['B']);

    expect(await countOf('A')).toBe(1);
    expect(await countOf('B')).toBe(2);
  });

  test('북마크가 없으면 빈 배열을 반환한다', async () => {
    await seedConvo(['orphan']);

    await expect(getConversationTags(USER)).resolves.toEqual([]);
  });

  test('position 순서는 유지된다', async () => {
    await seedTag('second', 0, 2);
    await seedTag('first', 0, 1);

    const tags = await getConversationTags(USER);
    expect(tags.map((t) => t.tag)).toEqual(['first', 'second']);
  });

  test('북마크 해제 시 줄어든다', async () => {
    await seedTag('건설', 0);
    const convoId = await seedConvo(['건설']);

    expect(await countOf('건설')).toBe(1);

    await updateTagsForConversation(USER, convoId, []);

    expect(await countOf('건설')).toBe(0);
  });

  /**
   * 핵심 불변식 — 배지 건수와 사이드바 목록 건수가 같아야 한다.
   * 원래 버그는 배지는 저장값, 목록은 실시간 쿼리여서 발생했다.
   */
  test('배지 건수가 사이드바 목록 건수와 일치한다', async () => {
    await seedTag('건설', 31);
    await seedConvo(['건설']);
    await seedConvo(['건설']);
    const deleted = await seedConvo(['건설']);
    await seedConvo(['건설'], { isArchived: true });
    await softDeleteConvos(USER, { conversationId: deleted });

    const { conversations } = await getConvosByCursor(USER, { tags: ['건설'], limit: 100 });

    expect(await countOf('건설')).toBe(conversations.length);
    expect(conversations.length).toBe(2);
  });
});
