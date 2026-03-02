import createPayload from '../src/createPayload';
import { Constants, EModelEndpoint } from '../src/config';
import type { TSubmission } from '../src/types';

const createSubmission = (
  overrides?: Partial<TSubmission>,
  endpointOverrides?: Partial<TSubmission['endpointOption']>,
): TSubmission => {
  return {
    userMessage: {
      messageId: 'msg-user',
      conversationId: 'convo-123',
      parentMessageId: Constants.NO_PARENT,
      text: 'hello',
      sender: 'User',
      isCreatedByUser: true,
      error: false,
      unfinished: false,
      clientTimestamp: '2026-03-01T18:50:13.049',
    },
    isTemporary: false,
    messages: [],
    conversation: {
      endpoint: EModelEndpoint.assistants,
      conversationId: 'convo-123',
      title: 'Hello',
      createdAt: '2026-03-01T18:50:13.049Z',
      updatedAt: '2026-03-01T18:50:13.049Z',
    },
    endpointOption: {
      endpoint: EModelEndpoint.assistants,
      assistant_id: 'asst_123',
      thread_id: 'conv_123',
      model: 'gpt-4o',
      ...(endpointOverrides ?? {}),
    },
    ...overrides,
  };
};

describe('createPayload prompt migration', () => {
  it('migrates assistants requests with appId=2 to prompt-based responses via agents endpoint', () => {
    const submission = createSubmission(undefined, {
      additionalModelRequestFields: { appId: 2 },
    });

    const result = createPayload(submission);

    expect(result.server).toContain('/api/agents/chat/agents');
    expect(result.payload.endpoint).toBe(EModelEndpoint.agents);
    expect(result.payload.assistant_id).toBeUndefined();
    expect(result.payload.thread_id).toBeUndefined();
    expect(result.payload.model_parameters).toEqual(
      expect.objectContaining({
        useResponsesApi: true,
        prompt: {
          id: 'pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916',
          version: '2',
        },
      }),
    );
  });

  it('migrates assistants requests with appId=1 to criminal prompt version', () => {
    const submission = createSubmission(undefined, {
      additionalModelRequestFields: { appId: 1 },
    });

    const result = createPayload(submission);

    expect(result.payload.endpoint).toBe(EModelEndpoint.agents);
    expect(result.payload.model_parameters).toEqual(
      expect.objectContaining({
        useResponsesApi: true,
        prompt: {
          id: 'pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796',
          version: '3',
        },
      }),
    );
  });

  it('routes legacy assistants payloads through agents even when appId is missing', () => {
    const submission = createSubmission();

    const result = createPayload(submission);

    expect(result.server).toContain('/api/agents/chat/agents');
    expect(result.payload.endpoint).toBe(EModelEndpoint.agents);
    expect(result.payload.assistant_id).toBeUndefined();
    expect(result.payload.thread_id).toBeUndefined();
    expect(result.payload.model_parameters).toEqual({});
  });
});
