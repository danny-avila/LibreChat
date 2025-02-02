import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  useGetPrompts,
  useGetPromptGroup,
  useUpdatePromptGroup,
  useMakePromptProduction,
  useDeletePrompt,
} from '~/data-provider';
import { useHasAccess } from '../Roles';
import store from '~/store';

export const useCurrentPromptData = () => {
  const params = useParams();
  const promptId = params.promptId || '';
  const [selectionIndex, setSelectionIndex] = useState(0);
  const editorMode = useRecoilValue(store.promptsEditorMode);

  const { data: group, isLoading: isLoadingGroup } = useGetPromptGroup(promptId);
  const { data: prompts = [], isLoading: isLoadingPrompts } = useGetPrompts(
    { groupId: promptId },
    { enabled: !!promptId },
  );

  const hasShareAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.SHARED_GLOBAL,
  });

  const selectedPrompt = prompts[selectionIndex];

  const updateGroupMutation = useUpdatePromptGroup();
  const makeProductionMutation = useMakePromptProduction();
  const deletePromptMutation = useDeletePrompt();

  return {
    group,
    prompts,
    selectedPrompt,
    selectionIndex,
    setSelectionIndex,
    isLoadingGroup,
    isLoadingPrompts,
    hasShareAccess,
    editorMode,
    updateGroupMutation,
    makeProductionMutation,
    deletePromptMutation,
  };
};
