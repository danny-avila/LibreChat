import { Rocket } from 'lucide-react';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { useForm, FormProvider } from 'react-hook-form';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useOutletContext } from 'react-router-dom';
import { PermissionTypes, Permissions, SystemRoles } from 'librechat-data-provider';
import type { TCreatePrompt, TPrompt } from 'librechat-data-provider';
import {
  useGetPrompts,
  useCreatePrompt,
  useDeletePrompt,
  useGetPromptGroup,
  useUpdatePromptGroup,
  useMakePromptProduction,
} from '~/data-provider';
import { useAuthContext, usePromptGroupsNav, useHasAccess, useLocalize } from '~/hooks';
import CategorySelector from './Groups/CategorySelector';
import AlwaysMakeProd from './Groups/AlwaysMakeProd';
import NoPromptGroup from './Groups/NoPromptGroup';
import { Button, Skeleton } from '~/components/ui';
import PromptVariables from './PromptVariables';
import { useToastContext } from '~/Providers';
import PromptVersions from './PromptVersions';
import { PromptsEditorMode } from '~/common';
import DeleteConfirm from './DeleteVersion';
import PromptDetails from './PromptDetails';
import { findPromptGroup } from '~/utils';
import PromptEditor from './PromptEditor';
import SkeletonForm from './SkeletonForm';
import Description from './Description';
import SharePrompt from './SharePrompt';
import PromptName from './PromptName';
import Command from './Command';
import store from '~/store';

const { promptsEditorMode } = store;

const PromptForm = () => {
  const params = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();

  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const editorMode = useRecoilValue(promptsEditorMode);
  const alwaysMakeProd = useRecoilValue(store.alwaysMakeProd);
  const { data: group, isLoading: isLoadingGroup } = useGetPromptGroup(params.promptId || '');
  const { data: prompts = [], isLoading: isLoadingPrompts } = useGetPrompts(
    { groupId: params.promptId ?? '' },
    { enabled: !!params.promptId },
  );

  const prevIsEditingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectionIndex, setSelectionIndex] = useState<number>(0);
  const isOwner = useMemo(() => user?.id === group?.author, [user, group]);
  const selectedPrompt = useMemo(
    () => prompts[selectionIndex] as TPrompt | undefined,
    [prompts, selectionIndex],
  );

  const hasShareAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.SHARED_GLOBAL,
  });

  const methods = useForm({
    defaultValues: {
      prompt: '',
      promptName: group?.name || '',
      category: group?.category || '',
    },
  });

  const { handleSubmit, setValue, reset, watch } = methods;
  const promptText = watch('prompt');

  const createPromptMutation = useCreatePrompt({
    onMutate: (variables) => {
      reset(
        {
          prompt: variables.prompt.prompt,
          category: variables.group?.category || '',
        },
        { keepDirtyValues: true },
      );
    },
    onSuccess(data) {
      if (alwaysMakeProd && data.prompt._id && data.prompt.groupId) {
        makeProductionMutation.mutate(
          {
            id: data.prompt._id,
            groupId: data.prompt.groupId,
            productionPrompt: { prompt: data.prompt.prompt },
          },
          {
            onSuccess: () => setSelectionIndex(0),
          },
        );
      }

      reset({
        prompt: data.prompt.prompt,
        promptName: data.group?.name || '',
        category: data.group?.category || '',
      });

      setSelectionIndex(0);
    },
  });
  const updateGroupMutation = useUpdatePromptGroup({
    onError: () => {
      showToast({
        status: 'error',
        message: localize('com_ui_prompt_update_error'),
      });
    },
  });
  const makeProductionMutation = useMakePromptProduction();
  const deletePromptMutation = useDeletePrompt({
    onSuccess: (response) => {
      if (response.promptGroup) {
        navigate('/d/prompts');
      } else {
        setSelectionIndex(0);
      }
    },
  });

  const onSave = useCallback(
    (value: string) => {
      if (!value) {
        // TODO: show toast, cannot be empty.
        return;
      }
      const tempPrompt: TCreatePrompt = {
        prompt: {
          type: selectedPrompt?.type ?? 'text',
          groupId: selectedPrompt?.groupId ?? '',
          prompt: value,
        },
      };

      if (value === selectedPrompt?.prompt) {
        return;
      }

      createPromptMutation.mutate(tempPrompt);
    },
    [selectedPrompt, createPromptMutation],
  );

  const handleLoadingComplete = useCallback(() => {
    if (isLoadingGroup || isLoadingPrompts) {
      return;
    }
    setInitialLoad(false);
  }, [isLoadingGroup, isLoadingPrompts]);

  useEffect(() => {
    if (prevIsEditingRef.current && !isEditing) {
      handleSubmit((data) => onSave(data.prompt))();
    }
    prevIsEditingRef.current = isEditing;
  }, [isEditing, onSave, handleSubmit]);

  useEffect(() => {
    if (editorMode === PromptsEditorMode.SIMPLE) {
      const productionIndex = prompts.findIndex((prompt) => prompt._id === group?.productionId);
      setSelectionIndex(productionIndex !== -1 ? productionIndex : 0);
    }

    handleLoadingComplete();
  }, [params.promptId, editorMode, group?.productionId, prompts, handleLoadingComplete]);

  useEffect(() => {
    setValue('prompt', selectedPrompt?.prompt || '', { shouldDirty: false });
    setValue('category', group?.category || '', { shouldDirty: false });
  }, [selectedPrompt, group?.category, setValue]);

  const debouncedUpdateOneliner = useCallback(
    debounce((oneliner: string) => {
      if (!group) {
        return console.warn('Group not found');
      }

      updateGroupMutation.mutate({ id: group._id || '', payload: { oneliner } });
    }, 950),
    [updateGroupMutation, group],
  );

  const debouncedUpdateCommand = useCallback(
    debounce((command: string) => {
      if (!group) {
        return console.warn('Group not found');
      }

      updateGroupMutation.mutate({ id: group._id || '', payload: { command } });
    }, 950),
    [updateGroupMutation, group],
  );

  const { groupsQuery } = useOutletContext<ReturnType<typeof usePromptGroupsNav>>();

  if (initialLoad) {
    return <SkeletonForm />;
  }

  if (!isOwner && groupsQuery.data && user?.role !== SystemRoles.ADMIN) {
    const fetchedPrompt = findPromptGroup(
      groupsQuery.data,
      (group) => group._id === params.promptId,
    );
    if (!fetchedPrompt) {
      return <NoPromptGroup />;
    }

    return <PromptDetails group={fetchedPrompt} />;
  }

  if (!group) {
    return null;
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((data) => onSave(data.prompt))}>
        <div>
          <div className="flex flex-col items-center justify-between px-4 dark:text-gray-200 sm:flex-row">
            {isLoadingGroup ? (
              <Skeleton className="mb-1 flex h-10 w-32 flex-row items-center font-bold sm:text-xl md:mb-0 md:h-12 md:text-2xl" />
            ) : (
              <PromptName
                name={group.name}
                onSave={(value) => {
                  if (!group) {
                    return console.warn('Group not found');
                  }
                  updateGroupMutation.mutate({ id: group._id || '', payload: { name: value } });
                }}
              />
            )}
            <div className="flex h-10 flex-row gap-x-2">
              <CategorySelector
                className="w-48 md:w-56"
                currentCategory={group.category}
                onValueChange={(value) =>
                  updateGroupMutation.mutate({
                    id: group._id || '',
                    payload: { name: group.name || '', category: value },
                  })
                }
              />
              {hasShareAccess && <SharePrompt group={group} disabled={isLoadingGroup} />}
              {editorMode === PromptsEditorMode.ADVANCED && (
                <Button
                  size={'sm'}
                  className="h-10 border border-transparent bg-brand-blue-500 transition-all hover:bg-brand-blue-600 dark:bg-brand-blue-500 dark:hover:bg-brand-blue-600"
                  variant={'default'}
                  onClick={() => {
                    const { _id: promptVersionId = '', prompt } = selectedPrompt ?? ({} as TPrompt);
                    makeProductionMutation.mutate(
                      {
                        id: promptVersionId || '',
                        groupId: group._id || '',
                        productionPrompt: { prompt },
                      },
                      {
                        onSuccess: (_data, variables) => {
                          const productionIndex = prompts.findIndex(
                            (prompt) => variables.id === prompt._id,
                          );
                          setSelectionIndex(productionIndex);
                        },
                      },
                    );
                  }}
                  disabled={
                    isLoadingGroup ||
                    selectedPrompt?._id === group.productionId ||
                    makeProductionMutation.isLoading
                  }
                >
                  <Rocket className="cursor-pointer text-white" />
                </Button>
              )}
              <DeleteConfirm
                name={group.name}
                disabled={isLoadingGroup}
                selectHandler={() => {
                  deletePromptMutation.mutate({
                    _id: selectedPrompt?._id || '',
                    groupId: group._id || '',
                  });
                }}
              />
            </div>
          </div>
          {editorMode === PromptsEditorMode.ADVANCED && (
            <div className="mt-4 flex items-center justify-center text-text-primary sm:hidden">
              <AlwaysMakeProd />
            </div>
          )}
          <div className="flex h-full w-full flex-col md:flex-row">
            {/* Left Section */}
            <div className="flex-1 overflow-y-auto border-gray-300 p-4 dark:border-gray-600 md:max-h-[calc(100vh-150px)] md:border-r">
              {isLoadingPrompts ? (
                <Skeleton className="h-96" />
              ) : (
                <div className="flex flex-col gap-4">
                  <PromptEditor name="prompt" isEditing={isEditing} setIsEditing={setIsEditing} />
                  <PromptVariables promptText={promptText} />
                  <Description
                    initialValue={group.oneliner ?? ''}
                    onValueChange={debouncedUpdateOneliner}
                  />
                  <Command
                    initialValue={group.command ?? ''}
                    onValueChange={debouncedUpdateCommand}
                  />
                </div>
              )}
            </div>
            {/* Right Section */}
            {editorMode === PromptsEditorMode.ADVANCED && (
              <div className="flex-1 overflow-y-auto p-4 md:max-h-[calc(100vh-150px)] md:w-1/4 md:max-w-[35%] lg:max-w-[30%] xl:max-w-[25%]">
                {isLoadingPrompts ? (
                  <Skeleton className="h-96 w-full" />
                ) : (
                  !!prompts.length && (
                    <PromptVersions
                      group={group}
                      prompts={prompts}
                      selectionIndex={selectionIndex}
                      setSelectionIndex={setSelectionIndex}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

export default PromptForm;
