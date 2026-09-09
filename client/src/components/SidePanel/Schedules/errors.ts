import { readScheduleMCPOutcomes, scheduleMCPOutcomeSchema } from 'librechat-data-provider';
import type { TSchedule, ScheduleMCPStatus, ScheduleMCPOutcome } from 'librechat-data-provider';
import type { TranslationKeys, useLocalize } from '~/hooks';

export const MCP_STATUS_LABELS: Record<ScheduleMCPStatus, TranslationKeys> = {
  ready: 'com_ui_schedule_mcp_ready',
  mcp_reauth_required: 'com_ui_schedule_mcp_reauth',
  mcp_configuration_missing: 'com_ui_schedule_mcp_configuration',
  mcp_permission_denied: 'com_ui_schedule_mcp_permission',
  mcp_unavailable: 'com_ui_schedule_mcp_unavailable',
};

export function scheduleMCPRecoveryOutcomes(
  schedule: Pick<TSchedule, 'enabled' | 'disabledReason' | 'lastRun'>,
) {
  const reason = schedule.disabledReason;
  const preservesMCPRecovery =
    reason === 'mcp_reauth_required' ||
    reason === 'mcp_configuration_missing' ||
    reason === 'mcp_permission_denied' ||
    reason === 'too_many_failures';
  if (schedule.enabled || !preservesMCPRecovery) return [];
  const persisted = scheduleMCPOutcomeSchema.array().safeParse(schedule.lastRun?.mcp);
  return persisted.success ? persisted.data : readScheduleMCPOutcomes(schedule.lastRun?.error);
}

export function scheduleMCPNeedsAgentRecovery(outcomes: ScheduleMCPOutcome[]): boolean {
  return outcomes.some(
    (outcome) => outcome.status !== 'ready' && outcome.status !== 'mcp_permission_denied',
  );
}

export function scheduleMCPErrorMessage(
  error: Error,
  localize: ReturnType<typeof useLocalize>,
): string | undefined {
  const response = (
    error as Error & { response?: { status?: number; data?: { code?: string; mcp?: object } } }
  ).response;
  const payload = response?.data?.mcp;
  const parsed = scheduleMCPOutcomeSchema.array().safeParse(payload);
  if (!parsed.success) {
    return response?.data?.code === 'mcp_unavailable'
      ? localize(MCP_STATUS_LABELS.mcp_unavailable)
      : undefined;
  }
  const failures = parsed.data.filter((item) => item.status !== 'ready');
  return failures.length > 0
    ? failures
        .map((item) => `${item.server}: ${localize(MCP_STATUS_LABELS[item.status])}`)
        .join('; ')
    : undefined;
}
