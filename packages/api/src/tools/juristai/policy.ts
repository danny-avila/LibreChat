const FedCrimAppId = '1';
const LitigAIAppId = '2';

const uniq = (values: readonly string[]): string[] => [...new Set(values)];

export const DEFAULT_JURISTAI_APP_ID = LitigAIAppId;

export const JURISTAI_PROMPT_APP_MAP: Readonly<Record<string, string>> = {
  pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796: FedCrimAppId,
  pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916: LitigAIAppId,
};

export const SHARED_CORE_OPERATIONS = [
  'search-case',
  'get-case-metadata',
  'generate-case-summary',
  'retrieve-case-summary',
  'list-my-cases',
  'list-case-timeline',
  'get-latest-docket-entry',
  'get-case-calendar',
  'assign-user-to-case',
  'remove-user-from-case',
  'read-people-dossiers',
  'generate-motion',
  'summarize-document',
  'doc-critique',
  'precedent-query',
  'query-processor',
  'deadlines-insight',
  'legal-team-invite',
  'accept-legal-team-invite',
  'list-organization-members',
  'list-legal-team-members',
  'rename-legal-team',
  'remove-legal-team-member',
  'assign-legal-team-to-case',
  'delete-legal-team',
  'account-manager',
] as const;

export const LITIGAI_ONLY_OPERATIONS = [
  'demand-letter',
  'generate-lawsuit',
  'recommend-lawsuit',
  'retrieve-case-billing-summary',
  'generate-case-bill',
  'list-action-items',
  'create-action-item',
  'update-action-item',
  'assign-action-item',
  'complete-action-item',
  'list-case-important-dates',
  'create-case-important-date',
  'update-case-important-date',
  'delete-case-important-date',
] as const;

export const SCHEDULING_OPERATIONS = [
  'list-host-scheduling-schedules',
  'create-scheduling-schedule',
  'update-scheduling-schedule',
  'list-host-scheduling-event-types',
  'create-scheduling-event-type',
  'update-scheduling-event-type',
  'get-public-scheduling-link',
  'search-scheduling-slots',
  'create-scheduling-reservation',
  'delete-scheduling-reservation',
  'create-scheduling-booking',
  'cancel-scheduling-booking',
  'reschedule-scheduling-booking',
  'confirm-scheduling-booking',
  'connect-scheduling-conferencing',
  'disconnect-scheduling-conferencing',
  'retry-scheduling-conferencing',
  'list-host-scheduling-bookings',
] as const;

export const SIGNATURE_OPERATIONS = [
  'create-signature-request',
  'list-case-signatures',
  'get-signature-request-detail',
  'send-signature-reminder',
  'void-signature-request',
  'create-self-sign-session',
  'reconcile-signature-request',
] as const;

export const JURISTAI_PER_APP_OPERATIONS: Readonly<Record<string, string[]>> = {
  [FedCrimAppId]: uniq([...SHARED_CORE_OPERATIONS, ...SCHEDULING_OPERATIONS, ...SIGNATURE_OPERATIONS]),
  [LitigAIAppId]: uniq([
    ...SHARED_CORE_OPERATIONS,
    ...LITIGAI_ONLY_OPERATIONS,
    ...SCHEDULING_OPERATIONS,
    ...SIGNATURE_OPERATIONS,
  ]),
};

export const JURISTAI_APP_CONTEXT_OPERATION_IDS = new Set<string>([
  ...SHARED_CORE_OPERATIONS,
  ...LITIGAI_ONLY_OPERATIONS,
]);

export const normalizeJuristaiAppId = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

export const mapJuristaiPromptToAppId = (promptId: unknown): string | undefined => {
  const normalizedPromptId = normalizeJuristaiAppId(promptId);
  return normalizedPromptId ? JURISTAI_PROMPT_APP_MAP[normalizedPromptId] : undefined;
};

export const resolveJuristaiAppId = (
  appId: unknown,
  promptId?: unknown,
  perAppOperations: Readonly<Record<string, string[]>> = JURISTAI_PER_APP_OPERATIONS,
  defaultAppId = DEFAULT_JURISTAI_APP_ID,
): string => {
  const normalizedAppId = normalizeJuristaiAppId(appId);
  if (normalizedAppId && perAppOperations[normalizedAppId]) {
    return normalizedAppId;
  }
  const promptAppId = mapJuristaiPromptToAppId(promptId);
  if (promptAppId && perAppOperations[promptAppId]) {
    return promptAppId;
  }
  return defaultAppId;
};

export const isJuristaiAppContextOperation = (operationId: string): boolean =>
  JURISTAI_APP_CONTEXT_OPERATION_IDS.has(operationId);
