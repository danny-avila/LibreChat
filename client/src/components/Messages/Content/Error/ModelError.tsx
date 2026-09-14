import {
  ErrorTypes,
  ViolationTypes,
  isCodeWorkspaceSelectionErrorReason,
} from 'librechat-data-provider';
import type { CodeWorkspaceSelectionErrorReason } from 'librechat-data-provider';
import type { ErrorRendererProps } from './parts';
import type { TranslationKeys } from '~/hooks';
import { getProviderName, readNumber, readString, useErrorEndpoint } from './parts';
import { useLocalize } from '~/hooks';

const codeWorkspaceErrorKeys: Record<CodeWorkspaceSelectionErrorReason, TranslationKeys> = {
  required: 'com_error_code_workspace_required',
  invalid: 'com_error_code_workspace_invalid',
  worker_unavailable: 'com_error_code_workspace_worker_unavailable',
  unsupported: 'com_error_code_workspace_unsupported',
  missing: 'com_error_code_workspace_missing',
  locked: 'com_error_code_workspace_locked',
};

/**
 * Failures naming a provider, a model or a workspace selection. Each payload carries the identity
 * it is about (`info`, `reason`, `status`), so the only resolution done here is turning an
 * endpoint id into the name a reader recognizes.
 */
export default function ModelError({ json, message }: ErrorRendererProps) {
  const localize = useLocalize();
  const { provider: conversationProvider } = useErrorEndpoint(message);
  const errorKey = readString(json, 'code') ?? readString(json, 'type');
  const info = readString(json, 'info');
  /** `info` is an endpoint id on these payloads; the conversation's own provider is the fallback. */
  const provider = info != null ? getProviderName(info) : conversationProvider;

  if (errorKey === ErrorTypes.MISSING_MODEL) {
    return provider != null
      ? localize('com_error_missing_model', { 0: provider })
      : localize('com_error_models_not_loaded');
  }

  if (errorKey === ErrorTypes.ENDPOINT_MODELS_NOT_LOADED) {
    return provider != null
      ? localize('com_error_endpoint_models_not_loaded', { 0: provider })
      : localize('com_error_models_not_loaded');
  }

  if (errorKey === ViolationTypes.ILLEGAL_MODEL_REQUEST) {
    const [endpoint, model] = info?.split('|') ?? [];
    const requestedProvider =
      endpoint != null && endpoint !== '' ? getProviderName(endpoint) : conversationProvider;
    if (model == null || model === '' || requestedProvider == null) {
      return localize('com_error_model_not_found');
    }
    return localize('com_error_illegal_model_request', { 0: model, 1: requestedProvider });
  }

  if (errorKey === ErrorTypes.CODE_WORKSPACE_UNAVAILABLE) {
    const reason = readString(json, 'reason');
    return isCodeWorkspaceSelectionErrorReason(reason)
      ? localize(codeWorkspaceErrorKeys[reason])
      : localize('com_error_code_workspace_unavailable');
  }

  /** Provider-neutral, matching the sentence the server persists as the failure's own text. */
  const status = readNumber(json, 'status');
  return status != null
    ? localize('com_error_upstream_model_status', { 0: status })
    : localize('com_error_upstream_model');
}
