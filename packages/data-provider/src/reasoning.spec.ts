import { isOpaqueReasoning, stripOpaqueReasoning } from './reasoning';

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
  });
});
