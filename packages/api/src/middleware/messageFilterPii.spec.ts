import type { MessageFilterPiiConfig } from 'librechat-data-provider';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
import { createMessageFilterPii, findPiiMatchInMessages } from './messageFilterPii';

type CapturedResponse = { status?: number; body?: unknown };

function runMiddleware(
  config: MessageFilterPiiConfig | undefined,
  body: unknown,
): { capturedRes: CapturedResponse; nextCalls: number } {
  const captured: CapturedResponse = {};
  let nextCalls = 0;
  const mw = createMessageFilterPii({ getConfig: () => config });
  const req = { body } as unknown as Request;
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    nextCalls++;
  };
  mw(req, res, next);
  return { capturedRes: captured, nextCalls };
}

describe('messageFilterPii middleware', () => {
  it('passes through when no config is provided', () => {
    const { capturedRes, nextCalls } = runMiddleware(undefined, {
      text: 'my key is sk-proj-FAKE1234567890ABCDEF',
    });
    expect(nextCalls).toBe(1);
    expect(capturedRes.status).toBeUndefined();
  });

  it('passes through when req.body.text is missing', () => {
    const { capturedRes, nextCalls } = runMiddleware({}, {});
    expect(nextCalls).toBe(1);
    expect(capturedRes.status).toBeUndefined();
  });

  it('passes through when req.body.text is the empty string', () => {
    const { capturedRes, nextCalls } = runMiddleware({}, { text: '' });
    expect(nextCalls).toBe(1);
    expect(capturedRes.status).toBeUndefined();
  });

  it('passes through plain text that matches no pattern', () => {
    const { capturedRes, nextCalls } = runMiddleware({}, { text: 'hello world' });
    expect(nextCalls).toBe(1);
    expect(capturedRes.status).toBeUndefined();
  });

  it('rejects with 400 when an sk- token is present (default starters)', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      {},
      { text: 'my key is sk-proj-FAKE1234567890ABCDEF please' },
    );
    expect(nextCalls).toBe(0);
    expect(capturedRes.status).toBe(400);
    expect(capturedRes.body).toEqual({
      error: 'message_filter_pii_block',
      message: 'Message contains a sk- prefix token. Remove it and try again.',
    });
  });

  it('rejects with 400 when a Bearer header is present', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      {},
      { text: 'Authorization: Bearer eyJabc.def-ghi' },
    );
    expect(nextCalls).toBe(0);
    expect(capturedRes.status).toBe(400);
    expect(capturedRes.body).toMatchObject({ error: 'message_filter_pii_block' });
  });

  it('rejects with 400 when an api-key header is present', () => {
    const { capturedRes, nextCalls } = runMiddleware({}, { text: 'api-key: foo123bar' });
    expect(nextCalls).toBe(0);
    expect(capturedRes.status).toBe(400);
  });

  it('honors a starterPatterns subset (sk passes when only bearer is enabled)', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      { starterPatterns: ['bearer_header'] },
      { text: 'my key is sk-proj-FAKE1234567890ABCDEF please' },
    );
    expect(nextCalls).toBe(1);
    expect(capturedRes.status).toBeUndefined();
  });

  it('treats starterPatterns: [] as disabling all starters', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      { starterPatterns: [] },
      { text: 'my key is sk-proj-FAKE1234567890ABCDEF please' },
    );
    expect(nextCalls).toBe(1);
    expect(capturedRes.status).toBeUndefined();
  });

  it('rejects on a customPatterns match with the operator-supplied label', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      {
        starterPatterns: [],
        customPatterns: [{ id: 'org', label: 'Org token', regex: '\\bORG-[A-Z0-9]{6,}' }],
      },
      { text: 'token ORG-DEADBEEF here' },
    );
    expect(nextCalls).toBe(0);
    expect(capturedRes.status).toBe(400);
    expect(capturedRes.body).toEqual({
      error: 'message_filter_pii_block',
      message: 'Message contains a Org token. Remove it and try again.',
    });
  });

  it('layers customPatterns on top of starters', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      {
        customPatterns: [{ id: 'org', label: 'Org token', regex: '\\bORG-[A-Z0-9]{6,}' }],
      },
      { text: 'token ORG-DEADBEEF here' },
    );
    expect(nextCalls).toBe(0);
    expect(capturedRes.status).toBe(400);
  });

  it('rejects with 400 when a quoted excerpt contains a blocked token (clean text)', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      {},
      { text: 'explain this', quotes: ['leaked sk-proj-FAKE1234567890ABCDEF here'] },
    );
    expect(nextCalls).toBe(0);
    expect(capturedRes.status).toBe(400);
    expect(capturedRes.body).toMatchObject({ error: 'message_filter_pii_block' });
  });

  it('scans quotes even when req.body.text is empty', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      {},
      { text: '', quotes: ['api-key: foo123bar'] },
    );
    expect(nextCalls).toBe(0);
    expect(capturedRes.status).toBe(400);
  });

  it('rejects a secret split across a quote and the typed text (merged scan)', () => {
    // Neither piece matches the api-key pattern alone, but the merged
    // `> api-key:\n\nsecret` the model receives does (the pattern allows whitespace).
    const { capturedRes, nextCalls } = runMiddleware({}, { text: 'secret', quotes: ['api-key:'] });
    expect(nextCalls).toBe(0);
    expect(capturedRes.status).toBe(400);
    expect(capturedRes.body).toMatchObject({ error: 'message_filter_pii_block' });
  });

  it('passes through when neither text nor quotes match', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      {},
      { text: 'hello world', quotes: ['a clean excerpt', 'another clean one'] },
    );
    expect(nextCalls).toBe(1);
    expect(capturedRes.status).toBeUndefined();
  });

  it('ignores non-string quote entries without throwing', () => {
    const { capturedRes, nextCalls } = runMiddleware(
      {},
      { text: 'hello world', quotes: [null, 42, '', 'clean'] },
    );
    expect(nextCalls).toBe(1);
    expect(capturedRes.status).toBeUndefined();
  });

  it('returns the same compiled pattern array for repeat calls with the same config (memoization)', () => {
    const config: MessageFilterPiiConfig = {
      customPatterns: [{ id: 'org', label: 'Org token', regex: '\\bORG-[A-Z0-9]{6,}' }],
    };
    const a = runMiddleware(config, { text: 'plain' });
    const b = runMiddleware(config, { text: 'plain' });
    expect(a.nextCalls).toBe(1);
    expect(b.nextCalls).toBe(1);
  });

  it('drops an invalid customPattern regex without throwing and keeps other patterns active', () => {
    const config = {
      starterPatterns: [],
      customPatterns: [
        { id: 'broken', label: 'Broken', regex: '(' },
        { id: 'org', label: 'Org token', regex: '\\bORG-[A-Z0-9]{6,}' },
      ],
    } as unknown as MessageFilterPiiConfig;
    const benign = runMiddleware(config, { text: 'plain text' });
    expect(benign.nextCalls).toBe(1);
    expect(benign.capturedRes.status).toBeUndefined();
    const matching = runMiddleware(config, { text: 'token ORG-DEADBEEF here' });
    expect(matching.nextCalls).toBe(0);
    expect(matching.capturedRes.status).toBe(400);
  });
});

describe('findPiiMatchInMessages', () => {
  it('returns null for missing or empty messages', () => {
    expect(findPiiMatchInMessages(undefined, {})).toBeNull();
    expect(findPiiMatchInMessages([], {})).toBeNull();
  });

  it('returns null when no config is provided', () => {
    expect(
      findPiiMatchInMessages([{ role: 'user', content: 'sk-proj-FAKE123' }], undefined),
    ).toBeNull();
  });

  it('matches a system-role message (remote APIs accept caller-supplied system roles)', () => {
    const hit = findPiiMatchInMessages(
      [{ role: 'system', content: 'system primer with sk-proj-FAKE1234567890ABCDEF embedded' }],
      {},
    );
    expect(hit).toEqual({ id: 'sk_prefix', label: 'sk- prefix token' });
  });

  it('matches an assistant-role message (callers can include attacker-controlled history)', () => {
    const hit = findPiiMatchInMessages(
      [{ role: 'assistant', content: 'sk-proj-FAKE1234567890ABCDEF' }],
      {},
    );
    expect(hit).toEqual({ id: 'sk_prefix', label: 'sk- prefix token' });
  });

  it('matches a tool-role message', () => {
    const hit = findPiiMatchInMessages(
      [{ role: 'tool', content: 'tool reply leaking sk-proj-FAKE1234567890ABCDEF' }],
      {},
    );
    expect(hit).toEqual({ id: 'sk_prefix', label: 'sk- prefix token' });
  });

  it('matches a string-content user message', () => {
    const hit = findPiiMatchInMessages(
      [{ role: 'user', content: 'my key is sk-proj-FAKE1234567890ABCDEF' }],
      {},
    );
    expect(hit).toEqual({ id: 'sk_prefix', label: 'sk- prefix token' });
  });

  it('matches a content-parts user message (text part)', () => {
    const hit = findPiiMatchInMessages(
      [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:...' } },
            { type: 'text', text: 'Authorization: Bearer abc.def.ghi' },
          ],
        },
      ],
      {},
    );
    expect(hit).toEqual({ id: 'bearer_header', label: 'Bearer token' });
  });

  it('returns null when no user message matches', () => {
    expect(findPiiMatchInMessages([{ role: 'user', content: 'hello world' }], {})).toBeNull();
  });

  it('honors customPatterns from config', () => {
    const hit = findPiiMatchInMessages([{ role: 'user', content: 'token ORG-DEADBEEF here' }], {
      starterPatterns: [],
      customPatterns: [{ id: 'org', label: 'Org token', regex: '\\bORG-[A-Z0-9]{6,}' }],
    });
    expect(hit).toEqual({ id: 'org', label: 'Org token' });
  });
});
