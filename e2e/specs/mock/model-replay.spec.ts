import { expect, test } from '@playwright/test';
import type { TMessage } from 'librechat-data-provider';
import { assertFixtureConsumed, fixtureTurns, readReplayLedger } from './replay.helpers';
import {
  NEW_CHAT_PATH,
  fetchJson,
  messagesView,
  getAccessToken,
  selectMockEndpoint,
  sendMessageAndWaitForCompletion,
} from './helpers';

/**
 * Record-once/replay-forever coverage: one recorded real-provider conversation
 * replays keylessly through the real createRun → registered replay provider →
 * graph → SSE → persistence chain.
 *
 * Record (writes the fixture; needs a real provider key):
 *   E2E_MODEL_FIXTURES=record E2E_MODEL_FIXTURE_NAME=deepseek-two-turn \
 *   E2E_RECORD_PROVIDER_API_KEY=<key> \
 *   npx playwright test --config=e2e/playwright.config.mock.ts model-replay
 *
 * Replay (default, keyless): the same drive steps; the conversation binds to
 * the committed fixture by prompt text, assistant turns must equal the
 * recorded turns exactly, and the consumption ledger must drain completely.
 */
const COMMITTED_FIXTURE = 'deepseek-two-turn';
const RECORDING = process.env.E2E_MODEL_FIXTURES === 'record';
/**
 * Record mode writes to whatever `E2E_MODEL_FIXTURE_NAME` selects, so the
 * assertions have to inspect that artifact. Reading the committed fixture
 * instead would validate a pre-existing file while the recorder wrote
 * elsewhere — and because these prompts are fixed, the stale answers could
 * still match and pass a recording run that produced nothing verified.
 */
const FIXTURE = RECORDING
  ? (process.env.E2E_MODEL_FIXTURE_NAME ?? COMMITTED_FIXTURE)
  : COMMITTED_FIXTURE;
const RECORD_ENDPOINT = {
  label: 'Replay Record Provider',
  model: process.env.E2E_RECORD_PROVIDER_MODEL || 'deepseek-chat',
};

const TURN_PROMPTS = [
  'Name the two prime numbers between 20 and 30, comma separated, and nothing else.',
  'Now add those two primes together and reply with just the sum.',
];

test.describe('recorded model fixture replay', () => {
  test('a recorded conversation replays deterministically through the real pipeline', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(NEW_CHAT_PATH, { timeout: 10_000 });
    if (RECORDING) {
      await selectMockEndpoint(page, RECORD_ENDPOINT);
    }

    for (const prompt of TURN_PROMPTS) {
      await sendMessageAndWaitForCompletion(page, prompt, { timeout: 90_000 });
    }

    const conversationId = /\/c\/([^/]+)/.exec(page.url())?.[1];
    expect(conversationId, 'conversation should have a persisted id').toBeTruthy();
    const token = await getAccessToken(page);
    const messages = await fetchJson<TMessage[]>(
      page,
      `/api/messages/${encodeURIComponent(conversationId as string)}`,
      token,
    );
    /** Agents-pipeline messages persist their text inside `content` parts;
     * top-level `text` stays empty. */
    const persistedText = (message: TMessage): string => {
      if (message.text) {
        return message.text;
      }
      return (message.content ?? [])
        .map((part) => {
          if (part?.type !== 'text') {
            return '';
          }
          const text = (part as { text?: string | { value?: string } }).text;
          return typeof text === 'string' ? text : (text?.value ?? '');
        })
        .join('');
    };
    const assistantTexts = messages
      .filter((message) => message.isCreatedByUser === false)
      .map(persistedText);
    expect(assistantTexts).toHaveLength(TURN_PROMPTS.length);

    if (RECORDING) {
      /** The recorder rides LangChain token callbacks, which the provider
       * stream dispatches without awaiting — the recording quiesces shortly
       * AFTER the durable-completion barrier, so the record-mode harvest
       * polls for the settled fixture instead of asserting a single read.
       * Replay mode needs no such poll: the replaying generator finishes its
       * ledger writes before the turn can persist. */
      await expect
        .poll(
          () => {
            try {
              const settled = fixtureTurns(FIXTURE);
              return (
                settled.length === TURN_PROMPTS.length &&
                settled.every(
                  (turn, index) =>
                    turn.userText === TURN_PROMPTS[index] &&
                    turn.finalText === assistantTexts[index],
                )
              );
            } catch {
              return false;
            }
          },
          {
            timeout: 15_000,
            intervals: [250, 500, 1_000],
            message: 'recorded fixture should quiesce with the persisted assistant turns',
          },
        )
        .toBe(true);
      for (const turn of fixtureTurns(FIXTURE)) {
        expect(turn.chunkCount, 'recording should capture incremental chunks').toBeGreaterThan(1);
      }
    } else {
      const turns = fixtureTurns(FIXTURE);
      expect(
        turns.map((turn) => turn.userText),
        'fixture invocations should mirror the driven prompts',
      ).toEqual(TURN_PROMPTS);
      expect(assistantTexts, 'replayed assistant turns should equal the recording exactly').toEqual(
        turns.map((turn) => turn.finalText),
      );
      await expect(messagesView(page)).toContainText(
        turns[turns.length - 1].finalText.slice(0, 40),
      );

      /** Streaming incrementality is asserted from the ledger's drained chunk
       * count, not by sampling transient DOM — every recorded chunk passed
       * through the live SSE wire before the durable completion barrier. */
      const ledger = readReplayLedger(FIXTURE);
      expect(ledger.chunksConsumed).toBe(ledger.chunksTotal);
      assertFixtureConsumed(FIXTURE);
    }

    expect(pageErrors, `Unexpected runtime errors: ${pageErrors.join(', ')}`).toHaveLength(0);
  });
});
