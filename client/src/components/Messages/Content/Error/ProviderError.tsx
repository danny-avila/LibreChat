import { ErrorTypes, stripLangChainTroubleshootingUrl } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { extractJson } from '~/utils/json';
import type { ErrorRendererProps, UnclassifiedErrorProps } from './parts';
import { ErrorBody, ErrorDetails, readString, useErrorEndpoint } from './parts';

function withHeadline(
  headline: string,
  detail?: { label: string; value: string },
): JSX.Element | string {
  if (detail == null) {
    return headline;
  }

  return (
    <ErrorBody>
      <div>{headline}</div>
      <ErrorDetails label={detail.label}>{detail.value}</ErrorDetails>
    </ErrorBody>
  );
}

/** Renders provider-produced failures with identity-aware copy and readable provider details. */
export default function ProviderError({ json, message }: ErrorRendererProps) {
  const localize = useLocalize();
  const { provider, model } = useErrorEndpoint(message);
  const errorKey = readString(json, 'code') ?? readString(json, 'type');

  if (errorKey === ErrorTypes.REFUSAL) {
    const headline =
      model != null
        ? localize('com_error_refusal', { 0: model })
        : localize('com_error_refusal_unknown');
    const info = readString(json, 'info');
    return info == null
      ? headline
      : withHeadline(headline, {
          label: localize('com_error_refusal_reason'),
          value: info,
        });
  }

  if (errorKey === ErrorTypes.GOOGLE_ERROR) {
    const headline = localize('com_error_google_error');
    const info = readString(json, 'info');
    return info == null
      ? headline
      : withHeadline(headline, {
          label: localize('com_error_details_provider'),
          value: info,
        });
  }

  if (errorKey === ErrorTypes.INVALID_REQUEST) {
    const headline =
      provider != null
        ? localize('com_error_invalid_request_error', { 0: provider })
        : localize('com_error_invalid_request_error_unknown');
    const detail =
      [readString(json, 'error'), readString(json, 'message'), readString(json, 'info')]
        .filter((value): value is string => value != null)
        .join('\n\n') || undefined;
    return detail == null
      ? headline
      : withHeadline(headline, {
          label: localize('com_error_details_provider'),
          value: detail,
        });
  }

  if (errorKey === ErrorTypes.NO_SYSTEM_MESSAGES) {
    return provider != null
      ? localize('com_error_no_system_messages', { 0: provider })
      : localize('com_error_no_system_messages_unknown');
  }

  return <UnclassifiedError json={json} text="" message={message} />;
}

/** Fallback for provider prose and payloads whose error code has no localized renderer. */
export function UnclassifiedError({ json, text, message }: UnclassifiedErrorProps) {
  const localize = useLocalize();
  const { provider } = useErrorEndpoint(message);
  const jsonString = extractJson(text);
  const remainder = jsonString !== '' ? text.replace(jsonString, '') : text;
  const prose =
    stripLangChainTroubleshootingUrl(remainder).trim() ||
    readString(json, 'error') ||
    readString(json, 'message') ||
    readString(json, 'info');
  /** A payload that told us nothing usable is its own statement; otherwise name who failed. */
  const providerHeadline =
    provider != null
      ? localize('com_error_provider_failed', { 0: provider })
      : localize('com_error_upstream_model');
  const headline = prose == null && json != null ? localize('com_error_unknown') : providerHeadline;

  if (prose == null) {
    return headline;
  }

  if (prose.length <= 240 && !/[\r\n]/.test(prose)) {
    return (
      <ErrorBody>
        <div>{headline}</div>
        <div className="text-text-secondary">{prose}</div>
      </ErrorBody>
    );
  }

  return withHeadline(headline, {
    label: localize('com_error_details_provider'),
    value: prose,
  });
}
