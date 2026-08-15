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

/** HTTP 상태코드를 들고 다니는 에러 — UI 에서 404(구버전 API)/403(sid 없음)을 구분해 보여준다. */
export class ProjectsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProjectsApiError';
    this.status = status;
  }
}

// 4xx 는 재시도해도 결과가 안 바뀐다 (404=API 미배포, 403=sid 없음).
// 네트워크 오류·5xx 만 1회 재시도해서 "빈 화면 전까지 7초 스피너"를 없앤다.
function retryOnServerErrorOnly(failureCount: number, error: unknown): boolean {
  if (error instanceof ProjectsApiError && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

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
      detail = await res.text().catch(() => '');
    }
    throw new ProjectsApiError(detail || `projects API failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export function useProjects(): UseQueryResult<ProjectSummary[], Error> {
  return useQuery<ProjectSummary[], Error>({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: async () => {
      const data = await request<{ projects: ProjectSummary[] }>('');
      return data.projects;
    },
    staleTime: 30_000,
    retry: retryOnServerErrorOnly,
  });
}

export function useProject(projectId: string | null): UseQueryResult<ProjectDetail, Error> {
  return useQuery<ProjectDetail, Error>({
    queryKey: projectQueryKey(projectId ?? ''),
    queryFn: () => request<ProjectDetail>(`/${projectId}`),
    enabled: Boolean(projectId),
    retry: retryOnServerErrorOnly,
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
