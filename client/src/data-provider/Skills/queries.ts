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
    [QueryKeys.skills, params?.category ?? '', params?.search ?? '', params?.limit ?? 20],
    () => dataService.listSkills(params),
    {
      staleTime: 1000 * 10,
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
