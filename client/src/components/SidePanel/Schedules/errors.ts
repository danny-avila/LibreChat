import { readScheduleMCPOutcomes, scheduleMCPOutcomeSchema } from 'librechat-data-provider';
import type { TSchedule, ScheduleMCPStatus } from 'librechat-data-provider';
import type { TranslationKeys, useLocalize } from '~/hooks';

export const MCP_STATUS_LABELS: Record<ScheduleMCPStatus, TranslationKeys> = {
  ready: 'com_ui_schedule_mcp_ready',
  mcp_reauth_required: 'com_ui_schedule_mcp_reauth',
  mcp_configuration_missing: 'com_ui_schedule_mcp_configuration',
  mcp_unavailable: 'com_ui_schedule_mcp_unavailable',
};

export function scheduleMCPRecoveryOutcomes(schedule: Pick<TSchedule, 'enabled' | 'lastRun'>) {
  return schedule.enabled ? [] : readScheduleMCPOutcomes(schedule.lastRun?.error);
}

export function scheduleMCPErrorMessage(
  error: Error,
  localize: ReturnType<typeof useLocalize>,
): string | undefined {
  const payload = (error as Error & { response?: { data?: { mcp?: object } } }).response?.data?.mcp;
  const parsed = scheduleMCPOutcomeSchema.array().safeParse(payload);
  if (!parsed.success) return undefined;
  const failures = parsed.data.filter((item) => item.status !== 'ready');
  return failures.length > 0
    ? failures
        .map((item) => `${item.server}: ${localize(MCP_STATUS_LABELS[item.status])}`)
        .join('; ')
    : undefined;
}
