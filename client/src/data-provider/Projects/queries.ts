import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  AddDocumentsResult,
  HarveyProject,
  HarveyRefreshResult,
  HarveySyncStarted,
  ProjectDetail,
  ProjectDocumentInput,
  ProjectSummary,
} from './types';

const BKL_PROXY_BASE = '/bkl';

export const PROJECTS_QUERY_KEY = ['bklProjects'];
export const projectQueryKey = (projectId: string) => ['bklProject', projectId];
export const HARVEY_PROJECTS_QUERY_KEY = ['bklHarveyProjects'];

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

/**
 * fetch 가 아니라 전역 axios 를 쓴다 — 로그인 시 setTokenHeader() 가 심어둔
 * Authorization: Bearer <LibreChat JWT> 기본 헤더가 실려야 /bkl 프록시의
 * optionalJwtAuth 가 req.user 를 복원해 X-BKL-User-Sid 를 주입할 수 있다.
 * (plain fetch 는 이 헤더가 없어 sid 미전달 → 403 "user identity required")
 */
async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  try {
    const res = await axios.request<T>({
      url: `${BKL_PROXY_BASE}/api/projects${path}`,
      method: init?.method ?? 'GET',
      data: init?.body,
      headers: { 'Content-Type': 'application/json' },
    });
    return res.data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) {
      const data = e.response.data as { detail?: unknown } | undefined;
      const detail =
        typeof data?.detail === 'string' ? data.detail : data ? JSON.stringify(data) : '';
      throw new ProjectsApiError(
        detail || `projects API failed (${e.response.status})`,
        e.response.status,
      );
    }
    throw e;
  }
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

/**
 * Harvey 동기화가 도는 동안에는 상세를 폴링한다.
 *
 * 동기화는 202 로 즉시 반환하고 백그라운드에서 돌기 때문에 완료 시점을 알려주는
 * 신호가 없다. 조직 합산 분당 10회 레이트 리밋 때문에 문서가 많으면 수 분이
 * 걸리므로, 진행 중일 때만 5초 간격으로 다시 물어보고 끝나면 멈춘다.
 */
const HARVEY_POLL_MS = 5_000;

export function useProject(projectId: string | null): UseQueryResult<ProjectDetail, Error> {
  return useQuery<ProjectDetail, Error>({
    queryKey: projectQueryKey(projectId ?? ''),
    queryFn: () => request<ProjectDetail>(`/${projectId}`),
    enabled: Boolean(projectId),
    retry: retryOnServerErrorOnly,
    refetchInterval: (data) => (data?.harvey_sync_status === 'syncing' ? HARVEY_POLL_MS : false),
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
    mutationFn: (body) => request<ProjectSummary>('', { method: 'POST', body }),
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
      request<ProjectDetail>(`/${projectId}`, { method: 'PATCH', body }),
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
        body: { documents },
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
        body: { doc_ids: docIds },
      }),
    onSuccess: (_data, { projectId }) => invalidate(projectId),
  });
}

/**
 * 로그인 사용자가 Harvey 에서 접근 가능한 프로젝트 — 전송 대상 후보.
 *
 * 서버가 BKL 중간 API 의 스냅샷을 읽어 준다. 스냅샷은 매시간 갱신되니 자주
 * 다시 물을 이유가 없다. 503(미설정)·400(이메일 없음)은 재시도해도 같다.
 */
export function useHarveyProjects(enabled = true): UseQueryResult<HarveyProject[], Error> {
  return useQuery<HarveyProject[], Error>({
    queryKey: HARVEY_PROJECTS_QUERY_KEY,
    queryFn: async () => {
      const data = await request<{ projects: HarveyProject[] }>('/harvey/projects');
      return data.projects;
    },
    enabled,
    staleTime: 60_000,
    retry: retryOnServerErrorOnly,
  });
}

/**
 * Harvey 프로젝트 스냅샷을 앞당겨 갱신한다.
 *
 * 사용자가 Harvey 에서 방금 만든 프로젝트는 다음 정시 동기화까지 목록에 없다.
 * 그때 쓰는 새로고침이다. 409 는 다른 동기화가 돌고 있다는 뜻이라 잠시 후 다시.
 */
export function useHarveyRefresh(): UseMutationResult<HarveyRefreshResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request<HarveyRefreshResult>('/harvey/refresh', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HARVEY_PROJECTS_QUERY_KEY });
    },
  });
}

/**
 * 프로젝트 문서를 선택한 Harvey 프로젝트로 보낸다.
 *
 * `harveyProjectId` 를 주면 그 프로젝트로 (이전과 다르면 서버가 업로드 기록을
 * 지우고 전부 다시 올린다), 비우면 이미 연결된 곳으로 이어서 보낸다.
 *
 * 서버는 202 만 주고 실제 업로드는 백그라운드에서 돈다. 그래서 mutation 성공은
 * "동기화가 끝났다"가 아니라 "시작됐다"는 뜻이고, 진행 상황은 useProject 의
 * 폴링으로 따라간다.
 */
export function useHarveySync(): UseMutationResult<
  HarveySyncStarted,
  Error,
  { projectId: string; harveyProjectId?: string; harveyProjectName?: string }
> {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, harveyProjectId, harveyProjectName }) =>
      request<HarveySyncStarted>(`/${projectId}/harvey-sync`, {
        method: 'POST',
        body: harveyProjectId
          ? { harvey_project_id: harveyProjectId, harvey_project_name: harveyProjectName }
          : undefined,
      }),
    onSuccess: (_data, { projectId }) => invalidate(projectId),
  });
}
