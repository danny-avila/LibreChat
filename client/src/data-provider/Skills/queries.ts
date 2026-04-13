import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type {
  QueryObserverResult,
  UseQueryOptions,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import type {
  TSkill,
  TSkillListRequest,
  TSkillListResponse,
  TListSkillFilesResponse,
  TSkillFileContentResponse,
} from 'librechat-data-provider';

/**
 * Paginated skill list (single page) — use this for small lists or when you want to
 * control pagination manually.
 */
export const useListSkillsQuery = (
  params?: TSkillListRequest,
  config?: UseQueryOptions<TSkillListResponse>,
): QueryObserverResult<TSkillListResponse> => {
  return useQuery<TSkillListResponse>(
    [
      QueryKeys.skills,
      params?.category ?? '',
      params?.search ?? '',
      params?.limit ?? 20,
      params?.cursor ?? '',
    ],
    () => dataService.listSkills(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

/**
 * Cursor-paginated infinite query for skills. Use this for the main skills listing UI.
 */
export const useSkillsInfiniteQuery = (
  params?: Omit<TSkillListRequest, 'cursor'>,
  config?: UseInfiniteQueryOptions<TSkillListResponse, unknown>,
) => {
  return useInfiniteQuery<TSkillListResponse, unknown>(
    [
      QueryKeys.skills,
      'infinite',
      params?.category ?? '',
      params?.search ?? '',
      params?.limit ?? 20,
    ],
    ({ pageParam }) => {
      const request: TSkillListRequest = {
        category: params?.category,
        search: params?.search,
        limit: params?.limit,
      };
      if (typeof pageParam === 'string' && pageParam.length > 0) {
        request.cursor = pageParam;
      }
      return dataService.listSkills(request);
    },
    {
      getNextPageParam: (lastPage) =>
        lastPage.has_more && lastPage.after ? lastPage.after : undefined,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

/**
 * Fetch a single skill by id (includes full body + frontmatter).
 */
export const useGetSkillQuery = (
  id: string | null | undefined,
  config?: UseQueryOptions<TSkill>,
): QueryObserverResult<TSkill> => {
  const enabled = !!id;
  return useQuery<TSkill>([QueryKeys.skill, id], () => dataService.getSkill(id as string), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
    enabled: enabled && (config?.enabled ?? true),
  });
};

/**
 * Alias kept for the original UI PR's call surface — components that still
 * import `useGetSkillByIdQuery` (e.g. `SkillsView`, `SkillForm`) resolve to
 * the same hook as `useGetSkillQuery`.
 */
export const useGetSkillByIdQuery = useGetSkillQuery;

/**
 * List file metadata for a single skill. In phase 1 this returns an empty array for
 * skills that have only an inline `SKILL.md`; multi-file skills arrive in phase 2.
 */
export const useListSkillFilesQuery = (
  skillId: string | null | undefined,
  config?: UseQueryOptions<TListSkillFilesResponse>,
): QueryObserverResult<TListSkillFilesResponse> => {
  const enabled = !!skillId;
  return useQuery<TListSkillFilesResponse>(
    [QueryKeys.skillFiles, skillId],
    () => dataService.listSkillFiles(skillId as string),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: enabled && (config?.enabled ?? true),
    },
  );
};

/**
 * Fetch a single skill file's content. Returns cached text from the DB when
 * available; otherwise the backend reads from storage, caches, and returns it.
 * Uses `staleTime: Infinity` because file content is cached server-side.
 */
export const useGetSkillFileContentQuery = (
  skillId: string | null | undefined,
  relativePath: string | null | undefined,
  config?: UseQueryOptions<TSkillFileContentResponse>,
): QueryObserverResult<TSkillFileContentResponse> => {
  const enabled = !!skillId && !!relativePath;
  return useQuery<TSkillFileContentResponse>(
    [QueryKeys.skillFileContent, skillId, relativePath],
    () => dataService.getSkillFileContent(skillId as string, relativePath as string),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      staleTime: Infinity,
      ...config,
      enabled: enabled && (config?.enabled ?? true),
    },
  );
};
