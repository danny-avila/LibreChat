import { useAtom } from 'jotai';
import { createStorageAtom } from '~/store/jotai-utils';
import { useAuthContext } from '~/hooks/AuthContext';

interface WorkspacePreference {
  key: string;
  workspaceId: string;
}

const preferences = createStorageAtom<WorkspacePreference[]>('codeWorkspacePreferences', []);

function validEntries(saved: WorkspacePreference[]): WorkspacePreference[] {
  return Array.isArray(saved)
    ? saved.filter(
        (entry) => entry && typeof entry.key === 'string' && typeof entry.workspaceId === 'string',
      )
    : [];
}

/** Browser-local hints, never authorization or conversation bindings. */
export function useWorkspacePreferences(agentId?: string | null) {
  const { user } = useAuthContext();
  const [saved, setSaved] = useAtom(preferences);
  const keyFor = (environmentId: string) =>
    JSON.stringify([user?.tenantId ?? '', user?.id, agentId, environmentId]);
  const entries = validEntries(saved);
  return {
    get: (environmentId: string) =>
      user?.id && agentId
        ? entries.find((entry) => entry.key === keyFor(environmentId))?.workspaceId
        : undefined,
    remember: (environmentId: string, workspaceId: string) => {
      if (!user?.id || !agentId) return;
      const key = keyFor(environmentId);
      // Bound this browser's disposable MRU cache; evictions only restore the chooser.
      try {
        setSaved((current) =>
          [
            { key, workspaceId },
            ...validEntries(current).filter((entry) => entry.key !== key),
          ].slice(0, 100),
        );
      } catch {
        // Disabled or full browser storage must not prevent explicit workspace selection.
      }
    },
  };
}
