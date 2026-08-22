import { createHmac } from 'crypto';

type IdentifierNamespace = 'cache' | 'safety';

function getIdentifierSecret(): string {
  const secret = process.env.CREDS_KEY;
  if (!secret) {
    throw new Error('CREDS_KEY is required to generate OpenAI request identifiers.');
  }
  return secret;
}

export function createOpenAIIdentifier(
  namespace: IdentifierNamespace,
  values: Array<string | null | undefined>,
): string {
  const input = values.map((value) => value ?? '').join(':');
  return createHmac('sha256', getIdentifierSecret()).update(`${namespace}:${input}`).digest('hex');
}
