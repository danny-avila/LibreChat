import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  AddDocumentsResult,
  ProjectDetail,
  ProjectDocumentInput,
  ProjectSummary,
} from './types';

const BKL_PROXY_BASE = '/bkl';

export const PROJECTS_QUERY_KEY = ['bklProjects'];
export const projectQueryKey = (projectId: string) => ['bklProject', projectId];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BKL_PROXY_BASE}/api/projects${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = typeof err?.detail === 'string' ? err.detail : JSON.stringify(err);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `projects API failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function useProjects(): UseQueryResult<ProjectSummary[], Error> {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: async () => {
      const data = await request<{ projects: ProjectSummary[] }>('');
      return data.projects;
    },
    staleTime: 30_000,
  });
}

export function useProject(projectId: string | null): UseQueryResult<ProjectDetail, Error> {
  return useQuery({
    queryKey: projectQueryKey(projectId ?? ''),
    queryFn: () => request<ProjectDetail>(`/${projectId}`),
    enabled: Boolean(projectId),
  });
}

function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return (projectId?: string) => {
    queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
    }
  };
}

export function useCreateProject(): UseMutationResult<
  ProjectSummary,
  Error,
  { name: string; description?: string }
> {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (body) =>
      request<ProjectSummary>('', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(),
  });
}

export function useRenameProject(): UseMutationResult<
  ProjectDetail,
  Error,
  { projectId: string; name?: string; description?: string }
> {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, ...body }) =>
      request<ProjectDetail>(`/${projectId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_data, { projectId }) => invalidate(projectId),
  });
}

export function useDeleteProject(): UseMutationResult<
  { deleted: boolean },
  Error,
  { projectId: string }
> {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId }) =>
      request<{ deleted: boolean }>(`/${projectId}`, { method: 'DELETE' }),
    onSuccess: (_data, { projectId }) => invalidate(projectId),
  });
}

export function useAddProjectDocuments(): UseMutationResult<
  AddDocumentsResult,
  Error,
  { projectId: string; documents: ProjectDocumentInput[] }
> {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, documents }) =>
      request<AddDocumentsResult>(`/${projectId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ documents }),
      }),
    onSuccess: (_data, { projectId }) => invalidate(projectId),
  });
}

export function useRemoveProjectDocuments(): UseMutationResult<
  { removed: number },
  Error,
  { projectId: string; docIds: string[] }
> {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, docIds }) =>
      request<{ removed: number }>(`/${projectId}/documents`, {
        method: 'DELETE',
        body: JSON.stringify({ doc_ids: docIds }),
      }),
    onSuccess: (_data, { projectId }) => invalidate(projectId),
  });
}
