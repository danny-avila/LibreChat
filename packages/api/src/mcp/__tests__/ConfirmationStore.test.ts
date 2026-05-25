import { ConfirmationStore, parseConfirmationEnvelope } from '~/mcp/ConfirmationStore';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ConfirmationStore', () => {
  describe('register / resolve', () => {
    it('resolves with the decision posted by the originating user', async () => {
      const store = new ConfirmationStore();
      const { confirmationId, waitForDecision } = await store.register('user-1', 5_000);

      expect(store.has(confirmationId)).toBe(true);
      expect(store.size()).toBe(1);

      const result = store.resolve(confirmationId, 'user-1', 'accept');
      expect(result).toEqual({ ok: true });

      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'accept' });
      expect(store.has(confirmationId)).toBe(false);
      expect(store.size()).toBe(0);
    });

    it('cancel decisions are surfaced to the awaiting promise', async () => {
      const store = new ConfirmationStore();
      const { confirmationId, waitForDecision } = await store.register('user-1', 5_000);

      store.resolve(confirmationId, 'user-1', 'cancel');
      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'cancel' });
    });
  });

  describe('TTL / timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves with timeout when ttl elapses without a decision', async () => {
      const store = new ConfirmationStore();
      const { confirmationId, waitForDecision } = await store.register('user-1', 1_000);
      expect(store.has(confirmationId)).toBe(true);

      jest.advanceTimersByTime(1_000);

      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'timeout' });
      expect(store.has(confirmationId)).toBe(false);
    });

    it('resolve called after timeout returns not_found', async () => {
      const store = new ConfirmationStore();
      const { confirmationId, waitForDecision } = await store.register('user-1', 1_000);

      jest.advanceTimersByTime(1_000);
      await waitForDecision;

      const result = store.resolve(confirmationId, 'user-1', 'accept');
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('does not invoke the timeout if resolved first', async () => {
      const store = new ConfirmationStore();
      const { confirmationId, waitForDecision } = await store.register('user-1', 1_000);

      store.resolve(confirmationId, 'user-1', 'accept');
      jest.advanceTimersByTime(5_000);

      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'accept' });
    });
  });

  describe('cross-user isolation', () => {
    it('rejects resolution attempts from a different userId without resolving', async () => {
      const store = new ConfirmationStore();
      const { confirmationId, waitForDecision } = await store.register('user-1', 5_000);

      const result = store.resolve(confirmationId, 'user-2', 'accept');
      expect(result).toEqual({ ok: false, reason: 'forbidden' });

      // Promise must remain unresolved — confirm by racing it.
      let settled = false;
      void waitForDecision.then(() => {
        settled = true;
      });
      // Allow any microtasks to flush.
      await Promise.resolve();
      expect(settled).toBe(false);

      // Originating user can still resolve.
      store.resolve(confirmationId, 'user-1', 'accept');
      await waitForDecision;
    });

    it('returns not_found for unknown confirmationId', () => {
      const store = new ConfirmationStore();
      const result = store.resolve('does-not-exist', 'user-1', 'accept');
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('double-resolve is idempotent (second call returns not_found)', async () => {
      const store = new ConfirmationStore();
      const { confirmationId, waitForDecision } = await store.register('user-1', 5_000);

      const first = store.resolve(confirmationId, 'user-1', 'accept');
      const second = store.resolve(confirmationId, 'user-1', 'cancel');
      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: false, reason: 'not_found' });

      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'accept' });
    });
  });

  describe('input validation', () => {
    it('throws when userId is empty', async () => {
      const store = new ConfirmationStore();
      await expect(store.register('', 1_000)).rejects.toThrow(/userId/);
    });

    it('throws on non-positive ttl', async () => {
      const store = new ConfirmationStore();
      await expect(store.register('u', 0)).rejects.toThrow(/ttlMs/);
      await expect(store.register('u', -1)).rejects.toThrow(/ttlMs/);
    });

    it('produces unique confirmationIds across calls', async () => {
      const store = new ConfirmationStore();
      const a = await store.register('user-1', 5_000);
      const b = await store.register('user-1', 5_000);
      expect(a.confirmationId).not.toEqual(b.confirmationId);
    });
  });
});

describe('parseConfirmationEnvelope', () => {
  it('parses an envelope from a CONTENT_ARRAY_PROVIDERS-shaped result', () => {
    const text = JSON.stringify({
      confirmationRequired: true,
      preview: 'Tool: send-chat-message',
      expiresInSeconds: 60,
      instruction: 'STOP. Do NOT...',
    });
    const result = [[{ type: 'text', text }], undefined];
    const env = parseConfirmationEnvelope(result);
    expect(env).toEqual({
      confirmationRequired: true,
      preview: 'Tool: send-chat-message',
      expiresInSeconds: 60,
      instruction: 'STOP. Do NOT...',
    });
  });

  it('parses an envelope from a string-shaped result', () => {
    const text = JSON.stringify({
      confirmationRequired: true,
      preview: 'Tool: createConfluencePage',
      expiresInSeconds: 90,
    });
    const result = [text, undefined];
    const env = parseConfirmationEnvelope(result);
    expect(env?.confirmationRequired).toBe(true);
    expect(env?.preview).toBe('Tool: createConfluencePage');
    expect(env?.expiresInSeconds).toBe(90);
  });

  it('returns null for plain text results', () => {
    expect(parseConfirmationEnvelope(['just a string', undefined])).toBeNull();
    expect(
      parseConfirmationEnvelope([[{ type: 'text', text: 'plain output' }], undefined]),
    ).toBeNull();
  });

  it('returns null for non-confirmation JSON', () => {
    const text = JSON.stringify({ ok: true, value: 42 });
    expect(parseConfirmationEnvelope([text, undefined])).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const text = '{not really json';
    expect(parseConfirmationEnvelope([text, undefined])).toBeNull();
  });

  it('returns null for empty / non-array inputs', () => {
    expect(parseConfirmationEnvelope(null)).toBeNull();
    expect(parseConfirmationEnvelope(undefined)).toBeNull();
    expect(parseConfirmationEnvelope([])).toBeNull();
    expect(parseConfirmationEnvelope([null, undefined])).toBeNull();
  });

  it('clamps invalid expiresInSeconds to a sane default', () => {
    const text = JSON.stringify({
      confirmationRequired: true,
      preview: 'p',
      expiresInSeconds: 'not a number',
    });
    const env = parseConfirmationEnvelope([text, undefined]);
    expect(env?.expiresInSeconds).toBe(120);
  });

  describe('presentation field', () => {
    function envelopeWith(presentation: unknown): unknown {
      const text = JSON.stringify({
        confirmationRequired: true,
        preview: 'Tool: x',
        expiresInSeconds: 60,
        presentation,
      });
      return [text, undefined];
    }

    it('extracts a well-formed presentation', () => {
      const env = parseConfirmationEnvelope(
        envelopeWith({
          title: 'Send Teams message',
          summary: 'Send to a Teams chat',
          fields: [
            {
              label: 'To',
              value: '19:abc',
              format: 'code',
              importance: 'primary',
            },
            {
              label: 'Message',
              value: 'hi',
              format: 'text',
            },
          ],
        }),
      );
      expect(env?.presentation).toBeDefined();
      expect(env?.presentation?.title).toBe('Send Teams message');
      expect(env?.presentation?.fields).toHaveLength(2);
      expect(env?.presentation?.fields[0]).toEqual({
        label: 'To',
        value: '19:abc',
        format: 'code',
        importance: 'primary',
      });
      // Optional fields default-omitted, not nulled.
      expect(env?.presentation?.fields[1].importance).toBeUndefined();
    });

    it('drops fields missing the required `label`', () => {
      const env = parseConfirmationEnvelope(
        envelopeWith({
          fields: [
            { label: 'ok', value: 1 },
            { value: 'no label' },
            { label: 'also ok', value: 'x' },
          ],
        }),
      );
      expect(env?.presentation?.fields.map((f) => f.label)).toEqual(['ok', 'also ok']);
    });

    it('drops the whole presentation when fields is missing or empty', () => {
      expect(parseConfirmationEnvelope(envelopeWith({ title: 't' }))?.presentation).toBeUndefined();
      expect(parseConfirmationEnvelope(envelopeWith({ fields: [] }))?.presentation).toBeUndefined();
    });

    it('rejects unknown format / importance enum values', () => {
      const env = parseConfirmationEnvelope(
        envelopeWith({
          fields: [
            {
              label: 'a',
              value: 1,
              format: 'pdf', // unknown
              importance: 'critical', // unknown
            },
          ],
        }),
      );
      expect(env?.presentation?.fields[0].format).toBeUndefined();
      expect(env?.presentation?.fields[0].importance).toBeUndefined();
    });

    it('preserves complex JSON values intact', () => {
      const env = parseConfirmationEnvelope(
        envelopeWith({
          fields: [
            {
              label: 'body',
              value: { content: 'hi', contentType: 'text' },
              format: 'json',
            },
          ],
        }),
      );
      expect(env?.presentation?.fields[0].value).toEqual({
        content: 'hi',
        contentType: 'text',
      });
    });

    it('returns no presentation when envelope omits the field', () => {
      const text = JSON.stringify({
        confirmationRequired: true,
        preview: 'p',
        expiresInSeconds: 60,
      });
      const env = parseConfirmationEnvelope([text, undefined]);
      expect(env?.presentation).toBeUndefined();
    });
  });
});
