import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import React from 'react';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { Menu, Rocket } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { Button, Skeleton, useToastContext } from '@librechat/client';
import {
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
} from 'librechat-data-provider';
import type { TCreatePrompt, TPrompt, TPromptGroup } from 'librechat-data-provider';
import {
  useGetPrompts,
  useGetPromptGroup,
  useAddPromptToGroup,
  useUpdatePromptGroup,
  useMakePromptProduction,
} from '~/data-provider';
import { useResourcePermissions, useHasAccess, useLocalize } from '~/hooks';
import CategorySelector from '../fields/CategorySelector';
import { usePromptGroupsContext } from '~/Providers';
import NoPromptGroup from '../lists/NoPromptGroup';
import PromptVariables from '../display/PromptVariables';
import { cn, findPromptGroup } from '~/utils';
import PromptVersions from '../display/PromptVersions';
import { PromptsEditorMode } from '~/common';
import DeleteVersion from '../dialogs/DeleteVersion';
import PromptDetails from '../display/PromptDetails';
import PromptEditor from '../editor/PromptEditor';
import SkeletonForm from '../utils/SkeletonForm';
import Description from '../fields/Description';
import SharePrompt from '../dialogs/SharePrompt';
import PromptName from '../fields/PromptName';
import Command from '../fields/Command';
import store from '~/store';

interface VersionsPanelProps {
  group: TPromptGroup;
  prompts: TPrompt[];
  selectedPrompt: any;
  selectionIndex: number;
  isLoadingPrompts: boolean;
  canEdit: boolean;
  setSelectionIndex: React.Dispatch<React.SetStateAction<number>>;
}

const VersionsPanel = React.memo(
  ({
    group,
    prompts,
    selectedPrompt,
    isLoadingPrompts,
    canEdit,
    selectionIndex,
    setSelectionIndex,
  }: VersionsPanelProps) => {
    const localize = useLocalize();
    const makeProductionMutation = useMakePromptProduction();

    const groupId = group?._id || '';
    const isLoadingGroup = !group;
    const isProductionVersion = selectedPrompt?._id === group?.productionId;

    return (
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-surface-primary"
        style={{ maxHeight: 'calc(100vh - 100px)' }}
      >
        {canEdit && (
          <div className="shrink-0 border-b border-border-light px-4 py-3">
            <Button
              variant="submit"
              size="sm"
              aria-label={localize('com_ui_make_production')}
              className={cn(
                'w-full gap-2 transition-all duration-200',
                isProductionVersion &&
                  'border border-green-500/30 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-950/50',
              )}
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
                isProductionVersion ||
                makeProductionMutation.isLoading ||
                !canEdit
              }
            >
              <Rocket className="size-4" aria-hidden="true" />
              <span className="text-sm font-medium">
                {isProductionVersion ? localize('com_ui_production') : localize('com_ui_deploy')}
              </span>
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoadingPrompts &&
            Array.from({ length: 6 }).map((_, index: number) => (
              <div key={index} className="my-2">
                <Skeleton className="h-[72px] w-full" />
              </div>
            ))}
          {!isLoadingPrompts && prompts.length > 0 && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-text-secondary">
                  {localize('com_ui_versions')}
                </h2>
                <span className="flex size-5 items-center justify-center rounded-full bg-surface-tertiary text-xs font-medium text-text-secondary">
                  {prompts.length}
                </span>
              </div>
              <PromptVersions
                group={group}
                prompts={prompts}
                selectionIndex={selectionIndex}
                setSelectionIndex={setSelectionIndex}
              />
            </>
          )}
        </div>
      </div>
    );
  },
);

VersionsPanel.displayName = 'VersionsPanel';

interface HeaderActionsProps {
  group: TPromptGroup;
  canEdit: boolean;
  selectedPromptId?: string;
  onCategoryChange?: (value: string) => void;
}

const HeaderActions = React.memo(
  ({ group, canEdit, selectedPromptId, onCategoryChange }: HeaderActionsProps) => {
    const hasShareAccess = useHasAccess({
      permissionType: PermissionTypes.PROMPTS,
      permission: Permissions.SHARE,
    });

    const groupId = group?._id || '';
    const groupCategory = group?.category || '';
    const isLoadingGroup = !group;

    return (
      <div className="flex items-center gap-2">
        <CategorySelector
          currentCategory={groupCategory}
          onValueChange={canEdit ? onCategoryChange : undefined}
        />
        {hasShareAccess && <SharePrompt group={group} disabled={isLoadingGroup} />}
        <DeleteVersion
          promptId={selectedPromptId}
          groupId={groupId}
          promptName={group?.name || ''}
          disabled={isLoadingGroup}
        />
      </div>
    );
  },
);

HeaderActions.displayName = 'HeaderActions';

const PromptForm = () => {
  const params = useParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { hasAccess } = usePromptGroupsContext();
  const alwaysMakeProd = useRecoilValue(store.alwaysMakeProd);
  const promptId = params.promptId || '';

  const editorMode = useRecoilValue(store.promptsEditorMode);
  const [selectionIndex, setSelectionIndex] = useState<number>(0);

  const prevIsEditingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const sidePanelWidth = '320px';

  const { data: group, isLoading: isLoadingGroup } = useGetPromptGroup(promptId, {
    enabled: hasAccess && !!promptId,
  });
  const { data: prompts = [], isLoading: isLoadingPrompts } = useGetPrompts(
    { groupId: promptId },
    { enabled: hasAccess && !!promptId },
  );

  const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
    ResourceType.PROMPTGROUP,
    group?._id || '',
  );

  const canEdit = hasPermission(PermissionBits.EDIT);
  const canView = hasPermission(PermissionBits.VIEW);

  const methods = useForm({
    defaultValues: {
      prompt: '',
      promptName: group ? group.name : '',
      category: group ? group.category : '',
    },
  });
  const { handleSubmit, setValue, reset, watch } = methods;
  const promptText = watch('prompt');

  const selectedPrompt = useMemo(
    () => (prompts.length > 0 ? prompts[selectionIndex] : undefined),
    [prompts, selectionIndex],
  );

  const selectedPromptId = useMemo(() => selectedPrompt?._id, [selectedPrompt?._id]);

  const { groupsQuery } = usePromptGroupsContext();

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
          prompt: variables.prompt.prompt,
          category: group?.category || '',
        },
        { keepDirtyValues: true },
      );
    },
    onSuccess(data) {
      if (alwaysMakeProd && data.prompt._id != null && data.prompt._id && data.prompt.groupId) {
        makeProductionMutation.mutate({
          id: data.prompt._id,
          groupId: data.prompt.groupId,
          productionPrompt: { prompt: data.prompt.prompt },
        });
      }

      reset({
        prompt: data.prompt.prompt,
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

      const groupId = selectedPrompt.groupId || group?._id;
      if (!groupId) {
        console.error('No groupId available');
        return;
      }

      const tempPrompt: TCreatePrompt = {
        prompt: {
          type: selectedPrompt.type ?? 'text',
          groupId: groupId,
          prompt: value,
        },
      };

      if (value === selectedPrompt.prompt) {
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
    if (prevIsEditingRef.current && !isEditing && canEdit) {
      handleSubmit((data) => onSave(data.prompt))();
    }
    prevIsEditingRef.current = isEditing;
  }, [isEditing, onSave, handleSubmit, canEdit]);

  useEffect(() => {
    handleLoadingComplete();
  }, [params.promptId, editorMode, group?.productionId, prompts, handleLoadingComplete]);

  useEffect(() => {
    setValue('prompt', selectedPrompt ? selectedPrompt.prompt : '', { shouldDirty: false });
    setValue('category', group ? group.category : '', { shouldDirty: false });
  }, [selectedPrompt, group, setValue]);

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

  const debouncedUpdateCommand = useMemo(
    () =>
      debounce((groupId: string, command: string, mutate: any) => {
        mutate({ id: groupId, payload: { command } });
      }, 950),
    [],
  );

  const handleUpdateOneliner = useCallback(
    (oneliner: string) => {
      if (!group || !group._id) {
        return console.warn('Group not found');
      }
      debouncedUpdateOneliner(group._id, oneliner, updateGroupMutation.mutate);
    },
    [group, updateGroupMutation.mutate, debouncedUpdateOneliner],
  );

  const handleUpdateCommand = useCallback(
    (command: string) => {
      if (!group || !group._id) {
        return console.warn('Group not found');
      }
      debouncedUpdateCommand(group._id, command, updateGroupMutation.mutate);
    },
    [group, updateGroupMutation.mutate, debouncedUpdateCommand],
  );

  const handleCategoryChange = useCallback(
    (value: string) => {
      if (!group?._id) {
        return;
      }
      updateGroupMutation.mutate({
        id: group._id,
        payload: { name: group.name, category: value },
      });
    },
    [group?._id, group?.name, updateGroupMutation],
  );

  if (initialLoad) {
    return <SkeletonForm />;
  }

  // Show read-only view if user doesn't have edit permission
  if (!canEdit && !permissionsLoading && groupsQuery.data) {
    const fetchedPrompt = findPromptGroup(
      groupsQuery.data,
      (group) => group._id === params.promptId,
    );
    if (!fetchedPrompt && !canView) {
      return <NoPromptGroup />;
    }

    if (fetchedPrompt || group) {
      return <PromptDetails group={fetchedPrompt || group} />;
    }
  }

  if (!group || group._id == null) {
    return null;
  }

  const groupName = group.name;

  return (
    <FormProvider {...methods}>
      <form className="mt-4 flex w-full" onSubmit={handleSubmit((data) => onSave(data.prompt))}>
        <h1 className="sr-only">{localize('com_ui_edit_prompt_page')}</h1>
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
                {/* Header: Title + Actions */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  {isLoadingGroup ? (
                    <Skeleton className="h-10 w-48 font-bold sm:text-xl md:h-12 md:text-2xl" />
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <PromptName
                          name={groupName}
                          isLoading={updateGroupMutation.isLoading}
                          onSave={(value) => {
                            if (!canEdit || !group._id) {
                              return;
                            }
                            updateGroupMutation.mutate({
                              id: group._id,
                              payload: { name: value },
                            });
                          }}
                        />
                        {editorMode === PromptsEditorMode.ADVANCED && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 lg:hidden"
                            onClick={() => setShowSidePanel(true)}
                            aria-label={localize('com_ui_versions')}
                          >
                            <Menu className="mr-1.5 size-4" aria-hidden="true" />
                            <span>{localize('com_ui_versions')}</span>
                          </Button>
                        )}
                      </div>
                      <div className="hidden shrink-0 sm:block">
                        <HeaderActions
                          group={group}
                          canEdit={canEdit}
                          selectedPromptId={selectedPromptId}
                          onCategoryChange={handleCategoryChange}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Mobile Actions Row */}
                {!isLoadingGroup && (
                  <div className="mb-4 sm:hidden">
                    <HeaderActions
                      group={group}
                      canEdit={canEdit}
                      selectedPromptId={selectedPromptId}
                      onCategoryChange={handleCategoryChange}
                    />
                  </div>
                )}

                {/* Main Editor Content */}
                {isLoadingPrompts ? (
                  <Skeleton className="h-96" aria-live="polite" />
                ) : (
                  <div className="mb-2 flex h-full flex-col gap-4">
                    <PromptEditor
                      name="prompt"
                      isEditing={isEditing}
                      setIsEditing={(value) => canEdit && setIsEditing(value)}
                    />
                    <PromptVariables promptText={promptText} />
                    <Description
                      initialValue={group.oneliner ?? ''}
                      onValueChange={canEdit ? handleUpdateOneliner : undefined}
                      disabled={!canEdit}
                    />
                    <Command
                      initialValue={group.command ?? ''}
                      onValueChange={canEdit ? handleUpdateCommand : undefined}
                      disabled={!canEdit}
                    />
                  </div>
                )}
              </div>

              {/* Versions Sidebar - Advanced Mode Only */}
              {editorMode === PromptsEditorMode.ADVANCED && (
                <div className="hidden w-72 shrink-0 border-l border-border-light lg:block xl:w-80">
                  <VersionsPanel
                    group={group}
                    prompts={prompts}
                    selectionIndex={selectionIndex}
                    selectedPrompt={selectedPrompt}
                    isLoadingPrompts={isLoadingPrompts}
                    canEdit={canEdit}
                    setSelectionIndex={setSelectionIndex}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mobile Overlay */}
          <button
            type="button"
            className={cn(
              'absolute inset-0 z-40 cursor-default bg-black/20',
              showSidePanel ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            style={{ transition: 'opacity 0.3s ease-in-out' }}
            onClick={() => setShowSidePanel(false)}
            aria-hidden={!showSidePanel}
            tabIndex={showSidePanel ? 0 : -1}
            aria-label={localize('com_ui_close_menu')}
          />

          {/* Mobile Versions Panel */}
          <div
            className="absolute inset-y-0 right-0 z-50 lg:hidden"
            style={{
              width: sidePanelWidth,
              transform: `translateX(${showSidePanel ? '0' : '100%'})`,
              transition: 'transform 0.3s ease-in-out',
            }}
            role="dialog"
            aria-modal="true"
            aria-label={localize('com_ui_versions')}
          >
            <div className="h-full bg-surface-primary shadow-xl">
              <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
                <h2 className="text-lg font-semibold text-text-primary">
                  {localize('com_ui_versions')}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSidePanel(false)}
                  aria-label={localize('com_ui_close')}
                >
                  <span className="sr-only">{localize('com_ui_close')}</span>
                  &times;
                </Button>
              </div>
              <VersionsPanel
                group={group}
                prompts={prompts}
                selectionIndex={selectionIndex}
                selectedPrompt={selectedPrompt}
                isLoadingPrompts={isLoadingPrompts}
                canEdit={canEdit}
                setSelectionIndex={setSelectionIndex}
              />
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

export default PromptForm;
