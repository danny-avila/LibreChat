export type MeoProject = {
  id: string;
  name: string;
  slug: string;
  description: string;
  instructions: string;
  memory_summary?: string | null;
  memory_count?: number;
  updated_at: string;
};
export type MeoProjectMemory = {
  id: string;
  project_id: string;
  kind: string;
  content: string;
  pinned: boolean;
  source: string;
  updated_at: string;
};
export class ProjectApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code === 'unauthenticated' ? 'Please sign in again.'
      : code === 'insufficient_scope' ? 'Your account cannot modify projects.'
      : code === 'project_not_found' ? 'This project is no longer available.'
      : code === 'not_found' ? 'Projects are not enabled on this server yet.'
      : code.replaceAll('_', ' '));
    this.name = 'ProjectApiError';
  }
}
const base = '/api/meo/projects';
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(base + path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: { code?: string } };
    throw new ProjectApiError(response.status, data.error?.code ?? 'request_failed');
  }
  return response.json() as Promise<T>;
}
const itemPath = (id: string) => '/' + encodeURIComponent(id);
export const projectsApi = {
  async list(): Promise<MeoProject[]> {
    return (await request<{ projects: MeoProject[] }>('')).projects;
  },
  async create(input: { name: string; description?: string; instructions?: string }): Promise<MeoProject> {
    return (await request<{ project: MeoProject }>('', {
      method: 'POST', body: JSON.stringify(input),
    })).project;
  },
  async update(id: string, input: { name?: string; description?: string; instructions?: string }): Promise<MeoProject> {
    return (await request<{ project: MeoProject }>(itemPath(id), {
      method: 'PATCH', body: JSON.stringify(input),
    })).project;
  },
  async memories(id: string): Promise<MeoProjectMemory[]> {
    return (await request<{ memories: MeoProjectMemory[] }>(itemPath(id) + '/memories')).memories;
  },
  async addMemory(id: string, content: string): Promise<MeoProjectMemory> {
    return (await request<{ memory: MeoProjectMemory }>(itemPath(id) + '/memories', {
      method: 'POST', body: JSON.stringify({ kind: 'note', content }),
    })).memory;
  },
};
