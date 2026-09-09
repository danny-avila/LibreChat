import {
  ErrorTypes,
  isCodeWorkspaceSelectionErrorReason,
} from 'librechat-data-provider';
import type { CodeWorkspaceSelectionErrorReason } from 'librechat-data-provider';

interface CodeWorkspaceErrorLike {
  code?: string;
  reason?: string;
}

interface CodeWorkspaceSelectionErrorDetails {
  reason?: CodeWorkspaceSelectionErrorReason;
}

export function getCodeWorkspaceSelectionErrorDetails(
  error?: CodeWorkspaceErrorLike | null,
): CodeWorkspaceSelectionErrorDetails {
  if (
    error?.code !== ErrorTypes.CODE_WORKSPACE_UNAVAILABLE ||
    !isCodeWorkspaceSelectionErrorReason(error.reason)
  ) {
    return {};
  }
  return { reason: error.reason };
}
