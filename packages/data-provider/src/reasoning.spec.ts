import type { OpaqueReasoningCursor } from './reasoning';
import {
  isOpaqueReasoning,
  stripOpaqueReasoning,
  sliceReasoningTail,
  advanceOpaqueReasoning,
  OPAQUE_REASONING_START,
} from './reasoning';

const bytes = (length: number, seed: number): Buffer =>
  Buffer.from(Array.from({ length }, (_, i) => (i * 37 + seed) % 256));

/** Bedrock Converse `reasoningContent.redactedContent`, base64-encoded by the SDK
 *  (OpenAI models on Bedrock, and Claude's redacted thinking on Bedrock). */
const bedrockRedacted = bytes(1_050, 3).toString('base64');
/** Anthropic `redacted_thinking.data`. */
const anthropicRedacted = `EmwKAhgBEgy${bytes(600, 5).toString('base64')}`;
/** OpenAI Responses `reasoning.encrypted_content` (base64url Fernet token). */
const openAIEncrypted = `gAAAAABo${bytes(900, 9).toString('base64url')}`;
/** Gemini `thoughtSignature`. */
const geminiSignature = `CiQB${bytes(300, 13).toString('base64')}`;

const readable = [
  'The user wants the deploy rolled back. First I will check which revision is live, then compare it with the last healthy one.',
  'Plan:\n1. read `config/app.ts`\n2. patch `getUser()`\n3. run `npm test -- --watch=false`',
  'The docs live at https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/agents#reasoning-labels and say so.',
  'Short',
  '42',
];

describe('isOpaqueReasoning', () => {
  it.each([
    ['Bedrock redactedContent', bedrockRedacted],
    ['Anthropic redacted_thinking', anthropicRedacted],
    ['OpenAI encrypted_content', openAIEncrypted],
    ['Gemini thought signature', geminiSignature],
    ['concatenated Bedrock deltas', `${bedrockRedacted}${bytes(400, 21).toString('base64')}`],
    ['payload with surrounding whitespace', `\n  ${bedrockRedacted}\n`],
  ])('classifies %s as opaque', (_name, text) => {
    expect(isOpaqueReasoning(text)).toBe(true);
  });

  it.each(readable.map((text) => [text.slice(0, 40), text]))(
    'keeps readable text: %s',
    (_n, text) => {
      expect(isOpaqueReasoning(text)).toBe(false);
    },
  );

  it('classifies a payload inside the persisted think wrapper as opaque', () => {
    expect(isOpaqueReasoning(`<think>${bedrockRedacted}</think>`)).toBe(true);
    expect(isOpaqueReasoning(`<think>\n${anthropicRedacted}\n</think>`)).toBe(true);
    expect(isOpaqueReasoning('<think>Checking the manifest.</think>')).toBe(false);
    expect(isOpaqueReasoning('<think></think>')).toBe(false);
  });

  it('does not treat empty or whitespace-only reasoning as opaque', () => {
    expect(isOpaqueReasoning('')).toBe(false);
    expect(isOpaqueReasoning(' \n\t')).toBe(false);
  });

  it('treats readable reasoning that quotes an encoded value as readable', () => {
    expect(isOpaqueReasoning(`The header carries ${openAIEncrypted}, so the token is set.`)).toBe(
      false,
    );
  });
});

describe('stripOpaqueReasoning', () => {
  it('removes encoded payloads and keeps the readable prose around them', () => {
    const text = `Checking the retry policy.\n${bedrockRedacted}\nBackoff fits the burst pattern.`;
    expect(stripOpaqueReasoning(text)).toBe(
      'Checking the retry policy.\n\nBackoff fits the burst pattern.',
    );
  });

  it('leaves readable reasoning unchanged', () => {
    for (const text of readable) {
      expect(stripOpaqueReasoning(text)).toBe(text);
    }
  });

  it('returns an empty string for a payload-only text', () => {
    expect(stripOpaqueReasoning(anthropicRedacted)).toBe('');
    expect(stripOpaqueReasoning(`<think>${anthropicRedacted}</think>`)).toBe('');
  });
});

describe('advanceOpaqueReasoning', () => {
  const stream = (deltas: string[]): { readable: string; cursor: OpaqueReasoningCursor } =>
    deltas.reduce(
      (acc, delta) => {
        const next = advanceOpaqueReasoning(acc.cursor, delta);
        return { readable: acc.readable + next.readable, cursor: next.cursor };
      },
      { readable: '', cursor: OPAQUE_REASONING_START },
    );
  const chunks = (text: string, size: number): string[] =>
    Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
      text.slice(i * size, (i + 1) * size),
    );

  it('passes readable token deltas through, holding only the unfinished word', () => {
    const result = stream(['Let', ' me', ' check', ' the', ' manifest.', ' Then', ' roll']);
    expect(result.readable).toBe('Let me check the manifest. Then ');
    expect(result.cursor).toEqual({ tail: 'roll', opaque: false });
  });

  it('drops a payload delivered as one delta', () => {
    expect(stream([bedrockRedacted]).readable).toBe('');
  });

  it('drops a payload split into deltas shorter than the threshold', () => {
    const result = stream(chunks(bedrockRedacted, 50));
    expect(result.readable).toBe('');
    expect(result.cursor.opaque).toBe(true);
  });

  it('keeps readable reasoning on both sides of a split payload', () => {
    const result = stream([
      'Checking the retry policy. ',
      ...chunks(bedrockRedacted, 100),
      ' Backoff fits the burst pattern.',
    ]);
    expect(result.readable).toBe('Checking the retry policy.  Backoff fits the burst pattern.');
    expect(result.cursor).toEqual({ tail: '', opaque: false });
  });

  it('never releases the end of a payload that shares a delta with readable text', () => {
    const payload = chunks(bedrockRedacted, 100);
    const last = payload.pop() ?? '';
    const result = stream(['Checking. ', ...payload, `${last}. Rolling back.`]);
    expect(result.readable).toBe('Checking. . Rolling back.');
  });
});

describe('sliceReasoningTail', () => {
  it('keeps short reasoning whole', () => {
    expect(sliceReasoningTail('Checking the manifest.', 600)).toBe('Checking the manifest.');
  });

  it('starts after a payload the window would cut', () => {
    const text = `${bedrockRedacted}\nRolling back the deploy.`;
    const tail = sliceReasoningTail(text, 100);
    expect(tail).toBe('\nRolling back the deploy.');
    expect(isOpaqueReasoning(tail)).toBe(false);
  });

  it('cuts at the window boundary when it falls between words', () => {
    expect(sliceReasoningTail('alpha beta gamma', 6)).toBe(' gamma');
  });
});
