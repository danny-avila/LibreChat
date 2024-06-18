import { Rocket } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useForm, FormProvider } from 'react-hook-form';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useOutletContext } from 'react-router-dom';
import { PermissionTypes, Permissions, SystemRoles } from 'librechat-data-provider';
import type { TCreatePrompt } from 'librechat-data-provider';
import {
  useCreatePrompt,
  useDeletePrompt,
  useUpdatePromptGroup,
  useMakePromptProduction,
} from '~/data-provider/mutations';
import { useAuthContext, usePromptGroupsNav, useHasAccess } from '~/hooks';
import { useGetPromptGroup, useGetPrompts } from '~/data-provider';
import CategorySelector from './Groups/CategorySelector';
import NoPromptGroup from './Groups/NoPromptGroup';
import { Button, Skeleton } from '~/components/ui';
import PromptVariables from './PromptVariables';
import PromptVersions from './PromptVersions';
import { TrashIcon } from '~/components/svg';
import PromptDetails from './PromptDetails';
import { findPromptGroup } from '~/utils';
import PromptEditor from './PromptEditor';
import SharePrompt from './SharePrompt';
import PromptName from './PromptName';
import store from '~/store';

const PromptForm = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const alwaysMakeProd = useRecoilValue(store.alwaysMakeProd);
  const { data: group, isLoading: isLoadingGroup } = useGetPromptGroup(params.promptId || '');
  const { data: prompts = [], isLoading: isLoadingPrompts } = useGetPrompts(
    { groupId: params.promptId ?? '' },
    { enabled: !!params.promptId },
  );

  const prevIsEditingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectionIndex, setSelectionIndex] = useState<number>(0);
  const isOwner = useMemo(() => user?.id === group?.author, [user, group]);
  const selectedPrompt = useMemo(() => prompts[selectionIndex], [prompts, selectionIndex]);

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
    onSuccess(data) {
      if (alwaysMakeProd && data.prompt._id && data.prompt.groupId) {
        makeProductionMutation.mutate({
          id: data.prompt._id,
          groupId: data.prompt.groupId,
          productionPrompt: { prompt: data.prompt.prompt },
        });
      }
      reset({
        prompt: data.prompt.prompt,
        promptName: data.group?.name || '',
        category: data.group?.category || '',
      });
      setSelectionIndex(0);
    },
  });
  const updateGroupMutation = useUpdatePromptGroup();
  const makeProductionMutation = useMakePromptProduction({
    onSuccess(_data, variables) {
      const productionIndex = prompts.findIndex((prompt) => variables.id === prompt._id);
      setSelectionIndex(productionIndex);
    },
  });
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

  useEffect(() => {
    if (prevIsEditingRef.current && !isEditing) {
      handleSubmit((data) => onSave(data.prompt))();
    }
    prevIsEditingRef.current = isEditing;
  }, [isEditing, onSave, handleSubmit]);

  useEffect(() => {
    setSelectionIndex(0);
  }, [params.promptId]);

  useEffect(() => {
    setValue('prompt', selectedPrompt?.prompt || '', { shouldDirty: false });
    setValue('category', group?.category || '', { shouldDirty: false });
  }, [selectedPrompt, group?.category, setValue]);

  const { groupsQuery } = useOutletContext<ReturnType<typeof usePromptGroupsNav>>();
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
                name={group?.name}
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
                currentCategory={group?.category}
                onValueChange={(value) =>
                  updateGroupMutation.mutate({
                    id: group?._id || '',
                    payload: { name: group?.name || '', category: value },
                  })
                }
              />
              {hasShareAccess && <SharePrompt group={group} disabled={isLoadingGroup} />}
              <Button
                size={'sm'}
                className="h-10 border border-transparent bg-green-400 transition-all hover:bg-green-500 dark:border-green-600 dark:bg-transparent dark:hover:bg-green-900"
                variant={'default'}
                onClick={() => {
                  const { _id: promptVersionId = '', prompt } = selectedPrompt;
                  makeProductionMutation.mutate({
                    id: promptVersionId || '',
                    groupId: group?._id || '',
                    productionPrompt: { prompt },
                  });
                }}
                disabled={
                  isLoadingGroup ||
                  selectedPrompt?._id === group?.productionId ||
                  makeProductionMutation.isLoading
                }
              >
                <Rocket className="cursor-pointer dark:text-green-600" />
              </Button>
              <Button
                size={'sm'}
                className="h-10 w-10 border border-transparent bg-red-100 text-red-500 transition-all hover:bg-red-500 hover:text-white dark:border-red-600 dark:bg-transparent dark:hover:bg-red-950"
                disabled={isLoadingGroup}
                onClick={() =>
                  deletePromptMutation.mutate({
                    _id: selectedPrompt?._id || '',
                    groupId: group?._id || '',
                  })
                }
              >
                <TrashIcon className="icon-lg cursor-pointer dark:text-red-600" />
              </Button>
            </div>
          </div>
          <div className="flex h-full w-full flex-col md:flex-row">
            {/* Left Section */}
            <div className="flex-1 overflow-y-auto border-r border-gray-300 p-4 dark:border-gray-600 md:max-h-[calc(100vh-150px)]">
              {isLoadingPrompts ? (
                <Skeleton className="h-96" />
              ) : (
                <>
                  <PromptEditor
                    name="prompt"
                    isEditing={isEditing}
                    setIsEditing={setIsEditing}
                    type={selectedPrompt?.type || ''}
                    prompt={selectedPrompt?.prompt || ''}
                  />
                  <PromptVariables promptText={promptText} />
                </>
              )}
            </div>
            {/* Right Section */}
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
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

export default PromptForm;
