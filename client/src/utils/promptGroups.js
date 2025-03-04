import { InfiniteCollections, QueryKeys } from 'librechat-data-provider';
import { addData, deleteData, updateData, updateFields, addToCacheList, updateCacheList, removeFromCacheList, getRecordByProperty, } from './collection';
export const addPromptGroup = (data, newPromptGroup) => {
    return addData(data, InfiniteCollections.PROMPT_GROUPS, newPromptGroup, (page) => page.promptGroups.findIndex((group) => group._id === newPromptGroup._id));
};
export const updatePromptGroup = (data, updatedPromptGroup) => {
    return updateData(data, InfiniteCollections.PROMPT_GROUPS, updatedPromptGroup, (page) => page.promptGroups.findIndex((group) => group._id === updatedPromptGroup._id));
};
export const deletePromptGroup = (data, groupId) => {
    return deleteData(data, InfiniteCollections.PROMPT_GROUPS, (page) => page.promptGroups.findIndex((group) => group._id === groupId));
};
export const updateGroupFields = (data, updatedGroup, callback) => {
    return updateFields(data, updatedGroup, InfiniteCollections.PROMPT_GROUPS, '_id', callback);
};
export const getSnippet = (promptText, length = 56) => {
    return promptText.length > length ? `${promptText.slice(0, length - 3)}...` : promptText;
};
export const findPromptGroup = (data, findProperty) => {
    return getRecordByProperty(data, InfiniteCollections.PROMPT_GROUPS, findProperty);
};
export const addGroupToAll = (queryClient, newGroup) => {
    addToCacheList(queryClient, [QueryKeys.allPromptGroups], newGroup);
};
export const updateGroupInAll = (queryClient, updatedGroup) => {
    updateCacheList({
        queryClient,
        queryKey: [QueryKeys.allPromptGroups],
        searchProperty: '_id',
        updateData: updatedGroup,
        searchValue: updatedGroup._id,
    });
};
export const removeGroupFromAll = (queryClient, groupId) => {
    removeFromCacheList(queryClient, [QueryKeys.allPromptGroups], '_id', groupId);
};
