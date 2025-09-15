import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import React from 'react';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { Menu, Rocket } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { Button, Skeleton, useToastContext } from '@librechat/client';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { TCreatePrompt, TMCPPromptArgument, TPromptGroup } from 'librechat-data-provider';
import {
  useAddPromptToGroup,
  useUpdatePromptGroup,
  useMakePromptProduction,
  useGetMCPPromptGroup,
  useGetMCPPrompt,
} from '~/data-provider';
import { useHasAccess, useLocalize } from '~/hooks';
import MCPPromptVariables from './MCPPromptVariables';
import { cn } from '~/utils';
import PromptVersions from './PromptVersions';
import { PromptsEditorMode } from '~/common';
import PromptEditor from './PromptEditor';
import SkeletonForm from './SkeletonForm';
import Description from './Description';
import SharePrompt from './SharePrompt';
import PromptName from './PromptName';
import store from '~/store';
import { useQueryClient } from '@tanstack/react-query';

interface RightPanelProps {
  group: TPromptGroup;
  mcp_prompts: TMCPPromptArgument[];
  selectedPrompt: any;
  selectionIndex: number;
  selectedPromptId?: string;
  isLoadingPrompts: boolean;
  canEdit: boolean;
  setSelectionIndex: React.Dispatch<React.SetStateAction<number>>;
}

const RightPanel = React.memo(
  ({
    group,
    mcp_prompts,
    selectedPrompt,
    isLoadingPrompts,
    canEdit,
    selectionIndex,
    setSelectionIndex,
  }: RightPanelProps) => {

    const editorMode = useRecoilValue(store.promptsEditorMode);
    const hasShareAccess = useHasAccess({
      permissionType: PermissionTypes.PROMPTS,
      permission: Permissions.SHARED_GLOBAL,
    });

    const makeProductionMutation = useMakePromptProduction();

    const groupId = group?._id || '';
    const isLoadingGroup = !group;

    return (
      <div
        className="h-full w-full overflow-y-auto bg-surface-primary px-4"
        style={{ maxHeight: 'calc(100vh - 100px)' }}
      >
        <div className="mb-2 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-x-2 xl:flex-row xl:space-y-0">
          <div className="mt-2 flex flex-row items-center justify-center gap-x-2 lg:mt-0">
            {hasShareAccess && <SharePrompt group={group} disabled={isLoadingGroup} />}
            {editorMode === PromptsEditorMode.ADVANCED && canEdit && (
              <Button
                variant="submit"
                size="sm"
                aria-label="Make prompt production"
                className="h-10 w-10 border border-transparent p-0.5 transition-all"
                onClick={() => {
                  if (!selectedPrompt) {
                    console.warn('No prompt is selected');
                    return;
                  }
                  const { _id: promptVersionId = '', prompt } = selectedPrompt;
                  makeProductionMutation.mutate({
                    id: promptVersionId,
                    groupId,
                    productionPrompt: { prompt },
                  });
                }}
                disabled={
                  isLoadingGroup ||
                  !selectedPrompt ||
                  selectedPrompt._id === group?.productionId ||
                  makeProductionMutation.isLoading ||
                  !canEdit
                }
              >
                <Rocket className="size-5 cursor-pointer text-white" />
              </Button>
            )}
          </div>
        </div>
        {editorMode === PromptsEditorMode.ADVANCED &&
          (isLoadingPrompts
            ? Array.from({ length: 6 }).map((_, index: number) => (
                <div key={index} className="my-2">
                  <Skeleton className="h-[72px] w-full" />
                </div>
              ))
            : mcp_prompts.length > 0 && (
                <PromptVersions
                  group={group}
                  prompts={[]}
                  mcpPrompts={mcp_prompts}
                  selectionIndex={selectionIndex}
                  setSelectionIndex={setSelectionIndex}
                />
              ))}
      </div>
    );
  },
);

RightPanel.displayName = 'RightPanel';

const MCPPromptForm = () => {
  const params = useParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const alwaysMakeProd = useRecoilValue(store.alwaysMakeProd);

  const editorMode = useRecoilValue(store.promptsEditorMode);
  const serverPromptCombined = params.serverName || '';
  const [selectionIndex, setSelectionIndex] = useState<number>(0);

  const prevIsEditingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const sidePanelWidth = '320px';
  const queryClient = useQueryClient();

  // Reset state and invalidate queries when route changes
  useEffect(() => {
    setSelectionIndex(0);
    setIsEditing(false);
    setInitialLoad(true);

    // Invalidate and refetch queries
    queryClient.invalidateQueries({
      queryKey: ['mcpPromptGroup', serverPromptCombined],
    });
    queryClient.invalidateQueries({
      queryKey: ['mcpPrompt', serverPromptCombined],
    });
}, [serverPromptCombined, queryClient]);

  const { data: group, isLoading: isLoadingGroup } = useGetMCPPromptGroup(serverPromptCombined, {
    staleTime: 0, // Always consider data stale
});

  const { data: mcp_prompts, isLoading: isLoadingPrompts } = useGetMCPPrompt(serverPromptCombined, {
    staleTime: 0, // Always consider data stale
  });

  const canEdit = false;
  const methods = useForm({
    defaultValues: {
      mcp_prompt: group?.description ? mcp_prompts?.description : '',
      promptName: group ? group.name : '',
      category: group ? group.category : '',
    },
  });
  const { handleSubmit, setValue, reset, watch } = methods;
  const promptText = mcp_prompts?.description;

  const selectedPrompt = useMemo(() => mcp_prompts ?? undefined, [mcp_prompts]);

  const selectedPromptId = useMemo(() => selectedPrompt?.name, [selectedPrompt?.name]);

  const updateGroupMutation = useUpdatePromptGroup({
    onError: () => {
      showToast({
        status: 'error',
        message: localize('com_ui_prompt_update_error'),
      });
    },
  });

  const makeProductionMutation = useMakePromptProduction();
  const addPromptToGroupMutation = useAddPromptToGroup({
    onMutate: (variables) => {
      reset(
        {
          mcp_prompt: variables.prompt.prompt,
          category: group?.category || '',
        },
        { keepDirtyValues: true },
      );
    },
    onSuccess(data) {
      if (
        alwaysMakeProd &&
        data.prompt.groupId != null &&
        data.prompt.prompt &&
        data.prompt.groupId
      ) {
        makeProductionMutation.mutate({
          id: data.prompt.groupId,
          groupId: data.prompt.groupId,
          productionPrompt: { prompt: data.prompt.prompt },
        });
      }

      reset({
        mcp_prompt: group?.description ? mcp_prompts?.description : '',
        promptName: group?.name || '',
        category: group?.category || '',
      });
    },
  });

  const onSave = useCallback(
    (value: string) => {
      if (!canEdit) {
        return;
      }
      if (!value) {
        // TODO: show toast, cannot be empty.
        return;
      }
      if (!selectedPrompt) {
        return;
      }

      const groupId = selectedPrompt?.mcpServerName || group?.name;
      if (!groupId) {
        console.error('No groupId available');
        return;
      }
      const tempPrompt: TCreatePrompt = {
        prompt: {
          type: 'text',
          groupId: selectedPrompt.name ?? '',
          prompt: value,
        },
      };

      if (value === selectedPrompt.name) {
        return;
      }

      // We're adding to an existing group, so use the addPromptToGroup mutation
      addPromptToGroupMutation.mutate({ ...tempPrompt, groupId });
    },
    [selectedPrompt, group, addPromptToGroupMutation, canEdit],
  );

  const handleLoadingComplete = useCallback(() => {
    if (isLoadingGroup || isLoadingPrompts) {
      return;
    }
    setInitialLoad(false);
  }, [isLoadingGroup, isLoadingPrompts]);

  useEffect(() => {
    if (prevIsEditingRef.current && !isEditing) {
      handleSubmit((data) => onSave(data.mcp_prompt || ''))();
    }
    prevIsEditingRef.current = isEditing;
  }, [isEditing, onSave, handleSubmit]);

  useEffect(() => {
    handleLoadingComplete();
  }, [params.promptId, editorMode, group?.name, mcp_prompts, handleLoadingComplete]);

  useEffect(() => {
    setValue('mcp_prompts', group?.description ? mcp_prompts?.description : '', {
      shouldDirty: false,
    });
    setValue('category', group ? group.category : '', { shouldDirty: false });
  }, [selectedPrompt, group, mcp_prompts, setValue]);

  useEffect(() => {
    const handleResize = () => {
      if (window.matchMedia('(min-width: 1022px)').matches) {
        setShowSidePanel(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const debouncedUpdateOneliner = useMemo(
    () =>
      debounce((groupId: string, oneliner: string, mutate: any) => {
        mutate({ id: groupId, payload: { oneliner } });
      }, 950),
    [],
  );

  const handleUpdateOneliner = useCallback(
    (oneliner: string) => {
      if (!group || !group.name) {
        return console.warn('Group not found');
      }
      debouncedUpdateOneliner(group.name, oneliner, updateGroupMutation.mutate);
    },
    [group, updateGroupMutation.mutate, debouncedUpdateOneliner],
  );

  if (initialLoad) {
    return <SkeletonForm />;
  }

  if (!group || group.name == null) {
    return null;
  }

  const groupName = group.name;
  const serverName = group.mcpServerName ?? mcp_prompts?.promptKey.split('_mcp_')[1];
  return (
    <FormProvider {...methods}>
      <form
        className="mt-4 flex w-full"
        onSubmit={handleSubmit((data) => onSave(data.mcp_prompt || ''))}
      >
        <div className="relative w-full">
          <div
            className="h-full w-full"
            style={{
              transform: `translateX(${showSidePanel ? `-${sidePanelWidth}` : '0'})`,
              transition: 'transform 0.3s ease-in-out',
            }}
          >
            <div className="flex h-full">
              <div className="flex-1 overflow-hidden px-4">
                <div className="mb-4 flex items-center gap-2 text-text-primary">
                  {isLoadingGroup ? (
                    <Skeleton className="mb-1 flex h-10 w-32 font-bold sm:text-xl md:mb-0 md:h-12 md:text-2xl" />
                  ) : (
                    <>
                      <PromptName
                        name={groupName}
                        mcp={true}
                        onSave={(value) => {
                          if (!group.name) {
                            return;
                          }
                          updateGroupMutation.mutate({
                            id: group.name,
                            payload: { name: value },
                          });
                        }}
                      />
                      <div className="flex-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 w-10 border border-border-light p-0 lg:hidden"
                        onClick={() => setShowSidePanel(true)}
                        aria-label={localize('com_endpoint_open_menu')}
                      >
                        <Menu className="size-5" />
                      </Button>
                      <div className="hidden lg:block">
                        {editorMode === PromptsEditorMode.SIMPLE && (
                          <RightPanel
                            group={group}
                            mcp_prompts={Array.isArray(mcp_prompts) ? mcp_prompts : []}
                            selectedPrompt={selectedPrompt}
                            selectionIndex={selectionIndex}
                            selectedPromptId={selectedPromptId}
                            isLoadingPrompts={isLoadingPrompts}
                            canEdit={canEdit}
                            setSelectionIndex={setSelectionIndex}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
                {isLoadingPrompts ? (
                  <Skeleton className="h-96" aria-live="polite" />
                ) : (
                  <div className="mb-2 flex h-full flex-col gap-4">
                    <PromptEditor
                      name="mcp_prompt"
                      isEditing={isEditing}
                      mcp={true}
                      setIsEditing={(value) => canEdit && setIsEditing(value)}
                      promptValue={mcp_prompts?.description || promptText}
                    />
                    <MCPPromptVariables promptArguments={mcp_prompts?.arguments} />
                    {/* Add debugging */}
                    {console.log('Debug Description Values:', {
                      groupDescription: group?.description,
                      promptsDescription: mcp_prompts?.description,
                      selectedPromptDescription: selectedPrompt?.description,
                      promptText: promptText,
                    })}
                    <Description
                      initialValue={'On MCP Server: ' + serverName}
                      onValueChange={handleUpdateOneliner}
                      disabled={true}
                    />
                  </div>
                )}
              </div>

              {editorMode === PromptsEditorMode.ADVANCED && (
                <div className="hidden w-1/4 border-l border-border-light lg:block">
                  <RightPanel
                    group={group}
                    mcp_prompts={Array.isArray(mcp_prompts) ? mcp_prompts : []}
                    selectionIndex={selectionIndex}
                    selectedPrompt={selectedPrompt}
                    selectedPromptId={selectedPromptId}
                    isLoadingPrompts={isLoadingPrompts}
                    canEdit={canEdit}
                    setSelectionIndex={setSelectionIndex}
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className={cn(
              'absolute inset-0 z-40 cursor-default',
              showSidePanel ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            style={{ transition: 'opacity 0.3s ease-in-out' }}
            onClick={() => setShowSidePanel(false)}
            aria-hidden={!showSidePanel}
            tabIndex={showSidePanel ? 0 : -1}
            aria-label={localize('com_ui_close_menu')}
          />
          <div
            className="absolute inset-y-0 right-0 z-50 lg:hidden"
            style={{
              width: sidePanelWidth,
              transform: `translateX(${showSidePanel ? '0' : '100%'})`,
              transition: 'transform 0.3s ease-in-out',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation panel"
          >
            <div className="h-full">
              <div className="h-full overflow-auto">
                <RightPanel
                  group={group}
                  mcp_prompts={Array.isArray(mcp_prompts) ? mcp_prompts : []}
                  selectionIndex={selectionIndex}
                  selectedPrompt={selectedPrompt}
                  selectedPromptId={selectedPromptId}
                  isLoadingPrompts={isLoadingPrompts}
                  canEdit={canEdit}
                  setSelectionIndex={setSelectionIndex}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

export default MCPPromptForm;
