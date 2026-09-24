const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('~/server/services/Config/app');
jest.mock('~/models/Message');
jest.mock('~/models/ToolCall', () => ({ deleteToolCalls: jest.fn() }));

const { Conversation } = require('~/db/models');

/**
 * 어드민 [삭제된 채팅] 탭의 내용 조회 — 복원 없이 읽기만 한다.
 *
 * BKL 요청의 핵심은 "사용자의 채팅 상태에 영향을 주지 않고" 내용을 보는
 * 것이므로, 조회 후 `bklDeletedAt` 가 그대로 남아있는지를 고정해 둔다.
 */
describe('GET /deleted-convos/messages', () => {
  let mongoServer;
  let app;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use(require('./deleted'));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Conversation.deleteMany({});
    await mongoose.connection.db.collection('messages').deleteMany({});
  });

  const seedConvo = async ({ deleted }) => {
    const conversationId = uuidv4();
    await Conversation.create({
      conversationId,
      user: 'user123',
      endpoint: 'openAI',
      title: '삭제된 대화',
      ...(deleted ? { bklDeletedAt: new Date() } : {}),
    });
    await mongoose.connection.db.collection('messages').insertMany([
      {
        messageId: uuidv4(),
        conversationId,
        isCreatedByUser: true,
        text: '질문입니다',
        createdAt: new Date(1),
      },
      {
        messageId: uuidv4(),
        conversationId,
        isCreatedByUser: false,
        content: [{ type: 'text', text: '답변입니다' }],
        model: 'gpt-4',
        createdAt: new Date(2),
      },
    ]);
    return conversationId;
  };

  test('삭제된 대화의 내용을 시간순으로 반환한다', async () => {
    const conversationId = await seedConvo({ deleted: true });

    const res = await request(app)
      .get('/deleted-convos/messages')
      .query({ conversation_id: conversationId });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('삭제된 대화');
    expect(res.body.data).toEqual([
      expect.objectContaining({ role: 'user', text: '질문입니다' }),
      expect.objectContaining({ role: 'assistant', text: '답변입니다', model: 'gpt-4' }),
    ]);
  });

  test('조회해도 소프트 삭제 상태가 유지된다', async () => {
    const conversationId = await seedConvo({ deleted: true });

    await request(app).get('/deleted-convos/messages').query({ conversation_id: conversationId });

    const convo = await Conversation.findOne({ conversationId }).lean();
    expect(convo.bklDeletedAt).toBeInstanceOf(Date);
  });

  test('삭제되지 않은 대화는 열어주지 않는다', async () => {
    const conversationId = await seedConvo({ deleted: false });

    const res = await request(app)
      .get('/deleted-convos/messages')
      .query({ conversation_id: conversationId });

    expect(res.status).toBe(400);
    expect(res.body.data).toBeUndefined();
  });

  test('없는 대화는 404', async () => {
    const res = await request(app)
      .get('/deleted-convos/messages')
      .query({ conversation_id: uuidv4() });

    expect(res.status).toBe(404);
  });

  test('conversation_id 누락 시 400', async () => {
    const res = await request(app).get('/deleted-convos/messages');

    expect(res.status).toBe(400);
  });
});
