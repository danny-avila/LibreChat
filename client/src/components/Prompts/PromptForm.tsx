import { Menu } from 'lucide-react';
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
import NoPromptGroup from './Groups/NoPromptGroup';
import { Button, Skeleton } from '~/components/ui';
import PromptVariables from './PromptVariables';
import { useToastContext } from '~/Providers';
import { PromptsEditorMode } from '~/common';
import PromptDetails from './PromptDetails';
import { RightPanel } from './RightPanel';
import { findPromptGroup } from '~/utils';
import PromptEditor from './PromptEditor';
import SkeletonForm from './SkeletonForm';
import Description from './Description';
import PromptName from './PromptName';
import Command from './Command';
import { cn } from '~/utils';
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
  const [sidePanelWidth] = useState('320px');
  const [showSidePanel, setShowSidePanel] = useState(false);
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

  useEffect(() => {
    const handleResize = () => {
      if (window.matchMedia('(min-width: 1022px)').matches) {
        setShowSidePanel(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      <form className="mt-4 flex w-full" onSubmit={handleSubmit((data) => onSave(data.prompt))}>
        <div className="relative w-full">
          <div
            className="h-full w-full"
            style={{
              transform: `translateX(${showSidePanel ? `-${sidePanelWidth}` : '0'})`,
              transition: 'transform 0.3s ease-in-out',
            }}
          >
            <div className="flex h-full">
              {/* Left Panel */}
              <div className="flex-1 overflow-hidden px-4">
                <div className="mb-4 flex items-center gap-2 text-text-primary">
                  {isLoadingGroup ? (
                    <Skeleton className="mb-1 flex h-10 w-32 font-bold sm:text-xl md:mb-0 md:h-12 md:text-2xl" />
                  ) : (
                    <>
                      <PromptName
                        name={group.name}
                        onSave={(value) => {
                          if (!group) {
                            return console.warn('Group not found');
                          }
                          updateGroupMutation.mutate({
                            id: group._id || '',
                            payload: { name: value },
                          });
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 w-14 border border-border-light lg:hidden"
                        onClick={() => setShowSidePanel(true)}
                      >
                        <Menu className="size-5" />
                      </Button>
                      <div className="flex-1" />
                      <div className="hidden lg:block">
                        {editorMode === PromptsEditorMode.SIMPLE && <RightPanel />}
                      </div>
                    </>
                  )}
                </div>
                {isLoadingPrompts ? (
                  <Skeleton className="h-96" />
                ) : (
                  <div className="flex h-full flex-col gap-4">
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

              {/* Desktop Right Panel */}
              {editorMode === PromptsEditorMode.ADVANCED && (
                <div className="hidden w-1/4 border-l border-border-light lg:block">
                  <RightPanel />
                </div>
              )}
            </div>
          </div>

          {/* Background Overlay */}
          <div
            role="button"
            tabIndex={0}
            className={cn(
              'absolute inset-0 z-40 bg-black/40',
              showSidePanel ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            style={{ transition: 'opacity 0.3s ease-in-out' }}
            onClick={() => setShowSidePanel(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setShowSidePanel(false);
              }
            }}
          />

          {/* Mobile Side Panel */}
          <div
            className="absolute inset-y-0 right-0 z-50 shadow-lg lg:hidden"
            style={{
              width: sidePanelWidth,
              transform: `translateX(${showSidePanel ? '0' : '100%'})`,
              transition: 'transform 0.3s ease-in-out',
            }}
          >
            <div className="h-full bg-background">
              <div className="h-full overflow-auto">
                <RightPanel />
              </div>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

export default PromptForm;
