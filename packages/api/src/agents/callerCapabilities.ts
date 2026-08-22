export type CallerCapabilityProjectionSnapshot = {
  version: 1;
  directToolNames: string[];
  codeExecutionToolNames: string[];
  directOnlyToolNames: string[];
  codeExecutionOnlyToolNames: string[];
};

/**
 * Accepts only complete snapshots for the version this host understands.
 * Missing or future versions intentionally fall back to the legacy registry
 * projection during a rolling SDK/host deployment.
 */
export function resolveCallerCapabilityProjectionSnapshot(
  value: unknown,
): CallerCapabilityProjectionSnapshot | undefined {
  if (value == null || typeof value !== 'object') {
    return undefined;
  }
  const snapshot = value as Partial<CallerCapabilityProjectionSnapshot>;
  const nameLists = [
    snapshot.directToolNames,
    snapshot.codeExecutionToolNames,
    snapshot.directOnlyToolNames,
    snapshot.codeExecutionOnlyToolNames,
  ];
  if (
    snapshot.version !== 1 ||
    nameLists.some(
      (names) => !Array.isArray(names) || names.some((name) => typeof name !== 'string'),
    )
  ) {
    return undefined;
  }
  return snapshot as CallerCapabilityProjectionSnapshot;
}
