import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { InfiniteData, QueryKey, UseMutationResult } from '@tanstack/react-query';
import type {
  TSkill,
  TSkillFile,
  TCreateSkill,
  TUpdateSkillVariables,
  TUpdateSkillResponse,
  TDeleteSkillResponse,
  TSkillListResponse,
  TSkillCacheEntry,
  TUploadSkillFileVariables,
  TDeleteSkillFileVariables,
  TDeleteSkillFileResponse,
  TListSkillFilesResponse,
  CreateSkillOptions,
  UpdateSkillOptions,
  DeleteSkillOptions,
  UploadSkillFileOptions,
  DeleteSkillFileOptions,
} from 'librechat-data-provider';

function isInfiniteSkillData(
  data: TSkillListResponse | InfiniteData<TSkillListResponse>,
): data is InfiniteData<TSkillListResponse> {
  return Array.isArray((data as InfiniteData<TSkillListResponse>).pages);
}

/**
 * Prepend a newly-created skill into every cached skill list. For infinite
 * queries the new skill is inserted at the top of page 0 only (it belongs
 * strictly "before" every other page by the cursor contract). For flat
 * queries it's prepended to the single page.
 *
 * Each call to the `setQueriesData` updater is scoped to one cache entry, so
 * we do NOT share state between invocations — a previous attempt at this used
 * a hoisted `prepended` flag, which silently dropped the update on whichever
 * cache entry was processed second.
 */
function addSkillToCachedLists(
  queryClient: ReturnType<typeof useQueryClient>,
  skill: TSkill,
): void {
  queryClient.setQueriesData<TSkillCacheEntry>([QueryKeys.skills], (data) => {
    if (!data) return data;
    if (isInfiniteSkillData(data)) {
      return {
        ...data,
        pages: data.pages.map((page, i) =>
          i === 0 ? { ...page, skills: [skill, ...page.skills] } : page,
        ),
      };
    }
    return { ...data, skills: [skill, ...data.skills] };
  });
}

/** Replace a skill by id in every cached page that contains it. */
function replaceSkillInCachedLists(
  queryClient: ReturnType<typeof useQueryClient>,
  skill: TSkill,
): void {
  queryClient.setQueriesData<TSkillCacheEntry>([QueryKeys.skills], (data) => {
    if (!data) return data;
    if (isInfiniteSkillData(data)) {
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          skills: page.skills.map((existing) => (existing._id === skill._id ? skill : existing)),
        })),
      };
    }
    return {
      ...data,
      skills: data.skills.map((existing) => (existing._id === skill._id ? skill : existing)),
    };
  });
}

/** Remove a deleted skill id from every cached page that contains it. */
function removeSkillFromCachedLists(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): void {
  queryClient.setQueriesData<TSkillCacheEntry>([QueryKeys.skills], (data) => {
    if (!data) return data;
    if (isInfiniteSkillData(data)) {
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          skills: page.skills.filter((s) => s._id !== id),
        })),
      };
    }
    return { ...data, skills: data.skills.filter((s) => s._id !== id) };
  });
}

/**
 * Create a new skill. On success, writes the new skill into both the detail and
 * list caches so any open listing UI updates immediately.
 */
export const useCreateSkillMutation = (
  options?: CreateSkillOptions,
): UseMutationResult<TSkill, unknown, TCreateSkill> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (payload: TCreateSkill) => dataService.createSkill(payload),
    ...rest,
    onSuccess: (skill, variables, context) => {
      queryClient.setQueryData<TSkill>([QueryKeys.skill, skill._id], skill);
      addSkillToCachedLists(queryClient, skill);
      if (onSuccess) onSuccess(skill, variables, context);
    },
  });
};

/**
 * Update a skill. Uses optimistic updates mirroring `useUpdatePromptGroup`:
 *   - cancel in-flight queries so a late refetch can't clobber the optimistic state
 *   - snapshot the previous skill + list data in `onMutate`
 *   - apply the patch locally
 *   - roll back on error
 *   - replace with server state on success (captures the new version)
 */
export const useUpdateSkillMutation = (
  options?: UpdateSkillOptions,
): UseMutationResult<TUpdateSkillResponse, unknown, TUpdateSkillVariables> => {
  const queryClient = useQueryClient();
  const { onMutate, onError, onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (vars: TUpdateSkillVariables) => dataService.updateSkill(vars),
    ...rest,
    onMutate: async (variables) => {
      // Prevent in-flight refetches from overwriting the optimistic update.
      await queryClient.cancelQueries([QueryKeys.skill, variables.id]);
      await queryClient.cancelQueries([QueryKeys.skills]);

      const previousSkill = queryClient.getQueryData<TSkill>([QueryKeys.skill, variables.id]);
      const previousListSnapshots = queryClient.getQueriesData<TSkillCacheEntry>([
        QueryKeys.skills,
      ]) as Array<[QueryKey, TSkillCacheEntry]>;

      if (previousSkill) {
        const optimistic: TSkill = {
          ...previousSkill,
          ...variables.payload,
          frontmatter: {
            ...(previousSkill.frontmatter ?? {}),
            ...(variables.payload.frontmatter ?? {}),
          } as TSkill['frontmatter'],
        };
        queryClient.setQueryData<TSkill>([QueryKeys.skill, variables.id], optimistic);
        replaceSkillInCachedLists(queryClient, optimistic);
      }

      const userContext = await onMutate?.(variables);
      return { previousSkill, previousListSnapshots, userContext };
    },
    onError: (error, variables, context) => {
      if (context?.previousSkill) {
        queryClient.setQueryData<TSkill>([QueryKeys.skill, variables.id], context.previousSkill);
      }
      if (context?.previousListSnapshots) {
        for (const [key, value] of context.previousListSnapshots) {
          queryClient.setQueryData(key, value);
        }
      }
      if (onError) onError(error, variables, context);
    },
    onSuccess: (skill, variables, context) => {
      queryClient.setQueryData<TSkill>([QueryKeys.skill, skill._id], skill);
      replaceSkillInCachedLists(queryClient, skill);
      if (onSuccess) onSuccess(skill, variables, context);
    },
  });
};

/**
 * Delete a skill. Removes it from caches and invalidates its file list cache.
 */
export const useDeleteSkillMutation = (
  options?: DeleteSkillOptions,
): UseMutationResult<TDeleteSkillResponse, unknown, { id: string }> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ id }: { id: string }) => dataService.deleteSkill(id),
    ...rest,
    onSuccess: (response, variables, context) => {
      queryClient.removeQueries([QueryKeys.skill, variables.id]);
      queryClient.removeQueries([QueryKeys.skillFiles, variables.id]);
      removeSkillFromCachedLists(queryClient, variables.id);
      if (onSuccess) onSuccess(response, variables, context);
    },
  });
};

/**
 * Upload a file into a skill. Stubbed in phase 1 — the backend responds 501.
 * The hook is wired now so the frontend can call it once the backend is ready.
 */
export const useUploadSkillFileMutation = (
  options?: UploadSkillFileOptions,
): UseMutationResult<TSkillFile, unknown, TUploadSkillFileVariables> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ skillId, formData }: TUploadSkillFileVariables) =>
      dataService.uploadSkillFile(skillId, formData),
    ...rest,
    onSuccess: (skillFile, variables, context) => {
      queryClient.setQueryData<TListSkillFilesResponse>(
        [QueryKeys.skillFiles, variables.skillId],
        (prev) => {
          if (!prev) return { files: [skillFile] };
          const filtered = prev.files.filter((f) => f.relativePath !== skillFile.relativePath);
          return { files: [...filtered, skillFile] };
        },
      );
      queryClient.invalidateQueries([QueryKeys.skill, variables.skillId]);
      if (onSuccess) onSuccess(skillFile, variables, context);
    },
  });
};

/**
 * Delete a file from a skill. Works in phase 1 — only the SkillFile row is removed.
 */
export const useDeleteSkillFileMutation = (
  options?: DeleteSkillFileOptions,
): UseMutationResult<TDeleteSkillFileResponse, unknown, TDeleteSkillFileVariables> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ skillId, relativePath }: TDeleteSkillFileVariables) =>
      dataService.deleteSkillFile(skillId, relativePath),
    ...rest,
    onSuccess: (response, variables, context) => {
      queryClient.setQueryData<TListSkillFilesResponse>(
        [QueryKeys.skillFiles, variables.skillId],
        (prev) => {
          if (!prev) return prev;
          return {
            files: prev.files.filter((f) => f.relativePath !== variables.relativePath),
          };
        },
      );
      queryClient.invalidateQueries([QueryKeys.skill, variables.skillId]);
      if (onSuccess) onSuccess(response, variables, context);
    },
  });
};
