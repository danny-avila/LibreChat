import { useTranslation } from 'react-i18next';
import type { ErrorRendererProps, JsonValue } from './parts';
import {
  ErrorBody,
  ErrorDetails,
  formatCredits,
  formatNumber,
  readNumber,
  readString,
} from './parts';
import { useLocalize } from '~/hooks';

type GenerationRow = {
  model: string;
  promptTokens: string;
  completionTokens: string;
};

function readGeneration(generation: JsonValue): GenerationRow | null {
  if (typeof generation !== 'object' || generation === null || Array.isArray(generation)) {
    return null;
  }

  const model = readString(generation, 'model');
  const promptTokens = readNumber(generation, 'promptTokens');
  const completionTokens = readNumber(generation, 'completionTokens');

  if (model == null && promptTokens == null && completionTokens == null) {
    return null;
  }

  const availableTokens = [
    promptTokens != null ? formatNumber(promptTokens) : null,
    completionTokens != null ? formatNumber(completionTokens) : null,
  ].filter((token): token is string => token != null);

  return {
    model: model ?? availableTokens.join(', '),
    promptTokens: promptTokens != null ? formatNumber(promptTokens) : '—',
    completionTokens: completionTokens != null ? formatNumber(completionTokens) : '—',
  };
}

/** Absent whenever auto-refill is off, so the message never promises a renewal that is not coming. */
function readRefillDate(json: ErrorRendererProps['json'], locale: string): string | null {
  const refillAt = readString(json, 'refillAt');
  if (refillAt == null) {
    return null;
  }
  const date = new Date(refillAt);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
}

export default function BalanceError({ json }: ErrorRendererProps) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const refillDate = readRefillDate(json, i18n.resolvedLanguage ?? 'en');
  const balance = readNumber(json, 'balance');
  const tokenCost = readNumber(json, 'tokenCost');
  const promptTokens = readNumber(json, 'promptTokens');
  const generations = Array.isArray(json.generations)
    ? json.generations.map(readGeneration).filter((row): row is GenerationRow => row != null)
    : [];

  const summary =
    tokenCost != null && balance != null
      ? localize('com_error_token_balance', {
          0: formatCredits(tokenCost),
          1: formatCredits(balance),
        })
      : localize('com_error_limit_reached');

  return (
    <ErrorBody>
      <p>{summary}</p>
      {refillDate != null ? (
        <p>{localize('com_error_token_balance_refill', { 0: refillDate })}</p>
      ) : null}
      <p>{localize('com_error_token_balance_help')}</p>
      {promptTokens != null ? (
        <p className="text-text-secondary">
          {localize('com_error_token_balance_prompt', { 0: formatNumber(promptTokens) })}
        </p>
      ) : null}
      {generations.length > 0 ? (
        <ErrorDetails label={localize('com_error_token_balance_generations')}>
          <ul className="list-none space-y-0.5">
            {generations.map((generation, index) => (
              <li key={index}>
                {localize('com_error_token_balance_generation', {
                  0: generation.model,
                  1: generation.promptTokens,
                  2: generation.completionTokens,
                })}
              </li>
            ))}
          </ul>
        </ErrorDetails>
      ) : null}
    </ErrorBody>
  );
}
