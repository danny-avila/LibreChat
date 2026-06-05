jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { logger } from '@librechat/data-schemas';
import { recordUsage } from './recordUsage';

/** Flush microtasks so any awaited internal promises resolve before assertions. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('recordUsage', () => {
  let spendTokens: jest.Mock;
  let spendMediaTokens: jest.Mock;
  let deps: { spendTokens: jest.Mock; spendMediaTokens: jest.Mock };

  beforeEach(() => {
    spendTokens = jest.fn().mockResolvedValue(undefined);
    spendMediaTokens = jest.fn().mockResolvedValue(undefined);
    deps = { spendTokens, spendMediaTokens };
    (logger.error as jest.Mock).mockClear();
  });

  describe('dispatch', () => {
    it('routes media payload to spendMediaTokens', async () => {
      await recordUsage(deps, {
        user: 'u1',
        model: 'whisper-1',
        context: 'stt',
        media: { type: 'audio_input', amount: 30 },
      });
      expect(spendMediaTokens).toHaveBeenCalledTimes(1);
      expect(spendMediaTokens).toHaveBeenCalledWith(
        expect.objectContaining({ user: 'u1', model: 'whisper-1', context: 'stt' }),
        { type: 'audio_input', amount: 30 },
      );
      expect(spendTokens).not.toHaveBeenCalled();
    });

    it('routes text payload (tokenUsage) to spendTokens', async () => {
      await recordUsage(deps, {
        user: 'u2',
        model: 'gpt-3.5-turbo',
        context: 'title',
        tokenUsage: { promptTokens: 50, completionTokens: 8 },
      });
      expect(spendTokens).toHaveBeenCalledTimes(1);
      expect(spendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ user: 'u2', model: 'gpt-3.5-turbo', context: 'title' }),
        { promptTokens: 50, completionTokens: 8 },
      );
      expect(spendMediaTokens).not.toHaveBeenCalled();
    });

    it('passes conversationId and messageId through', async () => {
      await recordUsage(deps, {
        user: 'u3',
        model: 'mistral-ocr-2505',
        context: 'ocr',
        conversationId: 'conv-123',
        messageId: 'msg-456',
        media: { type: 'ocr_pages', amount: 5 },
      });
      expect(spendMediaTokens).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-123', messageId: 'msg-456' }),
        { type: 'ocr_pages', amount: 5 },
      );
    });

    it('passes endpointTokenConfig through (for tenant overrides)', async () => {
      const endpointTokenConfig = { 'custom-whisper': { audio_input: 250 } };
      await recordUsage(deps, {
        user: 'u4',
        model: 'custom-whisper',
        context: 'stt',
        endpointTokenConfig,
        media: { type: 'audio_input', amount: 60 },
      });
      expect(spendMediaTokens).toHaveBeenCalledWith(
        expect.objectContaining({ endpointTokenConfig }),
        expect.anything(),
      );
    });

    it('forwards balance and transactions config flags', async () => {
      await recordUsage(deps, {
        user: 'u5',
        model: 'tts-1',
        context: 'tts',
        balance: { enabled: false },
        transactions: { enabled: false },
        media: { type: 'audio_output', amount: 42 },
      });
      expect(spendMediaTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: { enabled: false },
          transactions: { enabled: false },
        }),
        expect.anything(),
      );
    });
  });

  describe('fail-open contract', () => {
    it('does not reject when spendMediaTokens throws', async () => {
      spendMediaTokens.mockRejectedValueOnce(new Error('mongo down'));
      await expect(
        recordUsage(deps, {
          user: 'u1',
          model: 'whisper-1',
          context: 'stt',
          media: { type: 'audio_input', amount: 30 },
        }),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to record usage'),
        expect.objectContaining({ context: 'stt', model: 'whisper-1' }),
      );
    });

    it('does not reject when spendTokens throws', async () => {
      spendTokens.mockRejectedValueOnce(new Error('balance update conflict'));
      await expect(
        recordUsage(deps, {
          user: 'u2',
          model: 'gpt-4o',
          context: 'title',
          tokenUsage: { promptTokens: 50, completionTokens: 8 },
        }),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });

    it('preserves non-Error throw values in log', async () => {
      spendMediaTokens.mockRejectedValueOnce('string-error');
      await recordUsage(deps, {
        user: 'u',
        model: 'm',
        context: 'c',
        media: { type: 'audio_input', amount: 1 },
      });
      const logCall = (logger.error as jest.Mock).mock.calls[0];
      expect(logCall[1].err).toBe('string-error');
    });
  });

  describe('no-op cases', () => {
    it('does nothing when neither media nor tokenUsage is present', async () => {
      await recordUsage(
        deps,
        // @ts-expect-error — intentionally missing both branches
        { user: 'u', model: 'm', context: 'c' },
      );
      await flush();
      expect(spendTokens).not.toHaveBeenCalled();
      expect(spendMediaTokens).not.toHaveBeenCalled();
    });
  });
});
