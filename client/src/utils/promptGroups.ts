import { InfiniteCollections, QueryKeys } from 'librechat-data-provider';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  PromptGroupListResponse,
  PromptGroupListData,
  TPromptGroup,
} from 'librechat-data-provider';
import {
  addData,
  deleteData,
  updateData,
  updateFields,
  addToCacheList,
  updateCacheList,
  removeFromCacheList,
  getRecordByProperty,
} from './collection';

export const addPromptGroup = (
  data: InfiniteData<PromptGroupListResponse>,
  newPromptGroup: TPromptGroup,
): PromptGroupListData => {
  return addData<PromptGroupListResponse, TPromptGroup>(
    data,
    InfiniteCollections.PROMPT_GROUPS,
    newPromptGroup,
    (page) => page.promptGroups.findIndex((group) => group._id === newPromptGroup._id),
  );
};

export const updatePromptGroup = (
  data: InfiniteData<PromptGroupListResponse>,
  updatedPromptGroup: TPromptGroup,
): PromptGroupListData => {
  return updateData<PromptGroupListResponse, TPromptGroup>(
    data,
    InfiniteCollections.PROMPT_GROUPS,
    updatedPromptGroup,
    (page) => page.promptGroups.findIndex((group) => group._id === updatedPromptGroup._id),
  );
};

export const deletePromptGroup = (
  data: InfiniteData<PromptGroupListResponse>,
  groupId: string,
): PromptGroupListData => {
  return deleteData<PromptGroupListResponse, PromptGroupListData>(
    data,
    InfiniteCollections.PROMPT_GROUPS,
    (page) => page.promptGroups.findIndex((group) => group._id === groupId),
  );
};

export const updateGroupFields = (
  data: InfiniteData<PromptGroupListResponse>,
  updatedGroup: Partial<TPromptGroup>,
  callback?: (group: TPromptGroup) => void,
): InfiniteData<PromptGroupListResponse> => {
  return updateFields<PromptGroupListResponse, TPromptGroup>(
    data,
    updatedGroup,
    InfiniteCollections.PROMPT_GROUPS,
    '_id',
    callback,
  );
};

export const getSnippet = (promptText: string, length = 56) => {
  return promptText.length > length ? `${promptText.slice(0, length - 3)}...` : promptText;
};

export const findPromptGroup = (
  data: InfiniteData<PromptGroupListResponse>,
  findProperty: (group: TPromptGroup) => boolean,
): TPromptGroup | undefined => {
  return getRecordByProperty<PromptGroupListResponse, TPromptGroup>(
    data,
    InfiniteCollections.PROMPT_GROUPS,
    findProperty,
  );
};

export const addGroupToAll = (queryClient: QueryClient, newGroup: TPromptGroup) => {
  addToCacheList<TPromptGroup>(queryClient, [QueryKeys.allPromptGroups], newGroup);
};

export const updateGroupInAll = (
  queryClient: QueryClient,
  updatedGroup: Partial<TPromptGroup> & { _id: string },
) => {
  updateCacheList<TPromptGroup>({
    queryClient,
    queryKey: [QueryKeys.allPromptGroups],
    searchProperty: '_id',
    updateData: updatedGroup,
    searchValue: updatedGroup._id,
  });
};

export const removeGroupFromAll = (queryClient: QueryClient, groupId: string) => {
  removeFromCacheList<TPromptGroup>(queryClient, [QueryKeys.allPromptGroups], '_id', groupId);
};
