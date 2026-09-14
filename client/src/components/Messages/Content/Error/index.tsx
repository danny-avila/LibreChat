// file deepcode ignore HardcodedNonCryptoSecret: No hardcoded secrets
import { parseLangChainErrorCode } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { ErrorSource } from './source';
import type { ErrorPayload } from './parts';
import { errorCopy, errorRenderers } from './registry';
import { UnclassifiedError } from './ProviderError';
import { extractJson, isJson } from '~/utils/json';
import { useErrorSource } from './source';
import { useLocalize } from '~/hooks';

/**
 * The server converts classified LangChain failures into typed payloads, but messages persisted
 * before it did still carry the docs URL, so the code is read back out of the text to localize
 * those the same way. Codes without copy fall through to the provider text, stripped of the URL.
 */
const langChainErrorKeys: Record<string, TranslationKeys> = {
  MODEL_NOT_FOUND: 'com_error_model_not_found',
  MODEL_RATE_LIMIT: 'com_error_model_rate_limit',
};

function getLangChainErrorKey(text: string): TranslationKeys | undefined {
  const code = parseLangChainErrorCode(text);
  return code == null ? undefined : langChainErrorKeys[code];
}

/**
 * Renders a failed turn from whatever the server managed to persist.
 *
 * Three kinds of text arrive here: a typed payload this app produced, a provider's own error body,
 * and unclassified prose. A payload with copy wins, because it is the only one written for a
 * reader; everything else is shown through `UnclassifiedError`, which leads with what is known and
 * keeps the raw provider text as a detail rather than as the headline.
 *
 * `message` is the row when the caller has it; an error content part renders without one and reads
 * its row's identity from `ErrorSourceProvider` instead.
 */
const Error = ({ text, message: rowMessage }: { text: string; message?: ErrorSource }) => {
  const localize = useLocalize();
  const contextSource = useErrorSource();
  const message = rowMessage ?? contextSource;

  const langChainErrorKey = getLangChainErrorKey(text);
  if (langChainErrorKey != null) {
    return localize(langChainErrorKey);
  }

  const jsonString = extractJson(text);
  if (!isJson(jsonString)) {
    return <UnclassifiedError text={text} message={message} />;
  }

  const json = JSON.parse(jsonString) as ErrorPayload;
  const code = typeof json.code === 'string' ? json.code : undefined;
  const type = typeof json.type === 'string' ? json.type : undefined;
  const errorKey = code ?? type;

  if (errorKey != null) {
    const Renderer = errorRenderers[errorKey];
    if (Renderer != null) {
      return <Renderer json={json} text={text} message={message} />;
    }
    const copyKey = errorCopy[errorKey];
    if (copyKey != null) {
      return localize(copyKey);
    }
  }

  return <UnclassifiedError json={json} text={text} message={message} />;
};

export default Error;
