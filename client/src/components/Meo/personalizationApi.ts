export type MeoAiSettings = {
  version: number;
  personalInstructions: string;
  memoryEnabled: boolean;
  uiPreferences: Record<string, unknown>;
};

export type PersonalMemory = {
  id: string;
  kind: 'fact' | 'preference' | 'constraint' | 'note';
  content: string;
  enabled: boolean;
  archived_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export class MeoPersonalizationError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code === 'settings_version_conflict' || code === 'memory_not_found_or_conflict'
      ? 'Someone updated this setting on another device. Reload and try again.'
      : code === 'personalization_unavailable'
        ? 'Personalization is not yet available on this server.'
        : code.replaceAll('_', ' '));
    this.name = 'MeoPersonalizationError';
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api/meo' + path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
      Accept: 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { code?: string } };
    throw new MeoPersonalizationError(response.status, payload.error?.code ?? 'request_failed');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const personalizationApi = {
  async settings(): Promise<MeoAiSettings> {
    return (await api<{ settings: MeoAiSettings }>('/settings')).settings;
  },
  async saveSettings(input: {
    expectedVersion: number;
    personalInstructions?: string;
    memoryEnabled?: boolean;
  }): Promise<MeoAiSettings> {
    return (await api<{ settings: MeoAiSettings }>('/settings', {
      method: 'PATCH', body: JSON.stringify(input),
    })).settings;
  },
  async memories(archived = false): Promise<PersonalMemory[]> {
    return (await api<{ memories: PersonalMemory[] }>(
      '/memories' + (archived ? '?archived=true' : ''),
    )).memories;
  },
  async addMemory(kind: PersonalMemory['kind'], content: string): Promise<PersonalMemory> {
    return (await api<{ memory: PersonalMemory }>('/memories', {
      method: 'POST', body: JSON.stringify({ kind, content }),
    })).memory;
  },
  async updateMemory(memory: PersonalMemory, patch: {
    kind?: PersonalMemory['kind'];
    content?: string;
    enabled?: boolean;
    archived?: boolean;
  }): Promise<PersonalMemory> {
    return (await api<{ memory: PersonalMemory }>('/memories/' + encodeURIComponent(memory.id), {
      method: 'PATCH', body: JSON.stringify({ expectedVersion: memory.version, ...patch }),
    })).memory;
  },
  async deleteMemory(memory: PersonalMemory): Promise<void> {
    await api<void>('/memories/' + encodeURIComponent(memory.id), { method: 'DELETE' });
  },
};
