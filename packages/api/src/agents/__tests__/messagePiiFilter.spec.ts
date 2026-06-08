import { executeHooks } from '@librechat/agents';
import type { MessagePiiFilterConfig } from 'librechat-data-provider';
import type { UserPromptSubmitHookInput } from '@librechat/agents';
import { createMessagePiiFilterHooks } from '../messagePiiFilter';

function promptInput(prompt: string): UserPromptSubmitHookInput {
  return {
    hook_event_name: 'UserPromptSubmit',
    runId: 'run-1',
    threadId: 'thread-1',
    agentId: 'agent-1',
    prompt,
  };
}

function silent(overrides: Partial<MessagePiiFilterConfig> = {}): MessagePiiFilterConfig {
  return {
    onMatch: 'silent',
    redactionText: '[REDACTED]',
    ...overrides,
  };
}

describe('createMessagePiiFilterHooks', () => {
  it('returns undefined when config is undefined', () => {
    expect(createMessagePiiFilterHooks(undefined)).toBeUndefined();
  });

  it('returns undefined when no patterns would be selected', () => {
    const result = createMessagePiiFilterHooks(silent({ starterPatterns: ['nonexistent'] }));
    expect(result).toBeUndefined();
  });

  it('exposes a per-request collector for matches', () => {
    const result = createMessagePiiFilterHooks(silent());
    expect(result?.collector).toEqual({ matches: [] });
  });

  describe('silent mode', () => {
    it('redacts and surfaces updatedPrompt without blocking', async () => {
      const built = createMessagePiiFilterHooks(silent());
      expect(built).toBeDefined();
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('key sk-ant-FAKE1234567890 please'),
      });

      expect(result.updatedPrompt).toBe('key sk-[REDACTED] please');
      expect(result.decision).toBeUndefined();
      // Silent mode skips collector population (no consumer reads it)
      expect(built!.collector.matches).toEqual([]);
    });

    it('is a no-op when nothing matches', async () => {
      const built = createMessagePiiFilterHooks(silent());
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('a perfectly normal question'),
      });

      expect(result.updatedPrompt).toBeUndefined();
      expect(built!.collector.matches).toEqual([]);
    });
  });

  describe('warn mode', () => {
    it('redacts and reports matches identically to silent (controller surfaces them)', async () => {
      const built = createMessagePiiFilterHooks(silent({ onMatch: 'warn' }));
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('key sk-ant-FAKE1234567890 please'),
      });

      expect(result.updatedPrompt).toBe('key sk-[REDACTED] please');
      expect(built!.collector.matches.map((m) => m.patternId)).toEqual(['sk_prefix']);
    });
  });

  describe('block mode', () => {
    it('always denies on match', async () => {
      const built = createMessagePiiFilterHooks(silent({ onMatch: 'block' }));
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('key sk-ant-FAKE1234567890 please'),
      });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('message_pii_filter_block');
      expect(result.updatedPrompt).toBeUndefined();
    });

    it('passes through when nothing matches', async () => {
      const built = createMessagePiiFilterHooks(silent({ onMatch: 'block' }));
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('plain words'),
      });

      expect(result.decision).toBeUndefined();
    });
  });

  describe('pattern selection', () => {
    it('honors a starterPatterns subset', async () => {
      const built = createMessagePiiFilterHooks(silent({ starterPatterns: ['bearer_header'] }));
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('auth Bearer abc.def-ghi and key sk-ant-1234567890ABC'),
      });

      expect(result.updatedPrompt).toBe('auth Bearer [REDACTED] and key sk-ant-1234567890ABC');
    });

    it('uses customPatterns only when starterPatterns is empty', async () => {
      const built = createMessagePiiFilterHooks(
        silent({
          starterPatterns: [],
          customPatterns: [{ id: 'acme', label: 'Acme token', regex: '\\bACME-[A-Z0-9]{6,}' }],
        }),
      );
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('token ACME-DEADBEEF12 ok'),
      });

      expect(result.updatedPrompt).toBe('token [REDACTED] ok');
    });

    it('layers customPatterns on top of starters (both fire in one prompt)', async () => {
      const built = createMessagePiiFilterHooks(
        silent({
          onMatch: 'warn',
          customPatterns: [{ id: 'acme', label: 'Acme token', regex: '\\bACME-[A-Z0-9]{6,}' }],
        }),
      );
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('starter sk-anything-here and custom ACME-DEADBEEF12'),
      });

      const ids = built!.collector.matches.map((m) => m.patternId).sort();
      expect(ids).toContain('sk_prefix');
      expect(ids).toContain('acme');
      expect(result.updatedPrompt).toContain('sk-[REDACTED]');
      expect(result.updatedPrompt).toContain('[REDACTED]');
    });

    it('honors a custom redactionText', async () => {
      const built = createMessagePiiFilterHooks(silent({ redactionText: '[scrubbed]' }));
      const result = await executeHooks({
        registry: built!.registry,
        input: promptInput('key sk-ant-FAKE1234567890 found'),
      });

      expect(result.updatedPrompt).toBe('key sk-[scrubbed] found');
    });
  });
});
