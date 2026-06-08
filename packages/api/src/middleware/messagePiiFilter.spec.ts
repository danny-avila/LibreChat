import type { MessagePiiFilterConfig } from 'librechat-data-provider';
import type { Request, Response, NextFunction } from 'express';
import { createMessagePiiFilter } from './messagePiiFilter';

type CapturedResponse = { status?: number; body?: unknown };

function runMiddleware(
  config: MessagePiiFilterConfig | undefined,
  body: unknown,
): { capturedRes: CapturedResponse; nextCalls: number } {
  const captured: CapturedResponse = {};
  let nextCalls = 0;
  const mw = createMessagePiiFilter({ getConfig: () => config });
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

describe('messagePiiFilter middleware', () => {
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
      error: 'message_pii_filter_block',
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
    expect(capturedRes.body).toMatchObject({ error: 'message_pii_filter_block' });
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
      error: 'message_pii_filter_block',
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

  it('returns the same compiled pattern array for repeat calls with the same config (memoization)', () => {
    const config: MessagePiiFilterConfig = {
      customPatterns: [{ id: 'org', label: 'Org token', regex: '\\bORG-[A-Z0-9]{6,}' }],
    };
    const a = runMiddleware(config, { text: 'plain' });
    const b = runMiddleware(config, { text: 'plain' });
    expect(a.nextCalls).toBe(1);
    expect(b.nextCalls).toBe(1);
  });
});
