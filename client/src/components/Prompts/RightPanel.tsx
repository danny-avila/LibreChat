import { Rocket } from 'lucide-react';
import { TPrompt } from 'librechat-data-provider';
import CategorySelector from './Groups/CategorySelector';
import { Button, Skeleton } from '~/components/ui';
import { useCurrentPromptData } from '~/hooks';
import PromptVersions from './PromptVersions';
import { PromptsEditorMode } from '~/common';
import DeleteConfirm from './DeleteVersion';
import SharePrompt from './SharePrompt';

export const RightPanel = () => {
  const {
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
  } = useCurrentPromptData();

  if (!group || typeof group !== 'object') {
    return null;
  }

  const groupId = group._id || '';
  const groupName = group.name || '';
  const groupCategory = group.category || '';

  return (
    <div
      className="h-full w-full overflow-y-auto px-4"
      style={{ maxHeight: 'calc(100vh - 100px)' }}
    >
      <div className="mb-2 flex flex-row items-center justify-center gap-x-2 lg:flex-col lg:space-y-2 xl:flex-row xl:space-y-0">
        <CategorySelector
          currentCategory={groupCategory}
          onValueChange={(value) =>
            updateGroupMutation.mutate({
              id: groupId,
              payload: { name: groupName, category: value },
            })
          }
        />
        <div className="flex flex-row items-center justify-center gap-x-2">
          {hasShareAccess && <SharePrompt group={group} disabled={isLoadingGroup} />}
          {editorMode === PromptsEditorMode.ADVANCED && (
            <Button
              variant="submit"
              size="sm"
              className="h-10 w-10 border border-transparent p-0.5 transition-all"
              onClick={() => {
                if (!selectedPrompt) {
                  console.warn('No prompt is selected');
                  return;
                }
                const { _id: promptVersionId = '', prompt } = selectedPrompt;
                makeProductionMutation.mutate(
                  { id: promptVersionId, groupId, productionPrompt: { prompt } },
                  {
                    onSuccess: (_data, variables) => {
                      const productionIndex = prompts.findIndex((p) => variables.id === p._id);
                      setSelectionIndex(productionIndex);
                    },
                  },
                );
              }}
              disabled={
                isLoadingGroup ||
                !selectedPrompt ||
                selectedPrompt._id === group.productionId ||
                makeProductionMutation.isLoading
              }
            >
              <Rocket className="size-5 cursor-pointer text-white" />
            </Button>
          )}
          <DeleteConfirm
            name={groupName}
            disabled={isLoadingGroup}
            selectHandler={() => {
              deletePromptMutation.mutate({
                _id: selectedPrompt._id || '',
                groupId,
              });
            }}
          />
        </div>
      </div>
      {editorMode === PromptsEditorMode.ADVANCED &&
        (isLoadingPrompts
          ? Array.from({ length: 6 }).map((_: unknown, index: number) => (
            <div key={index} className="my-2">
              <Skeleton className="h-[72px] w-full" />
            </div>
          ))
          : !!prompts.length && (
            <PromptVersions
              group={group}
              prompts={prompts}
              selectionIndex={selectionIndex}
              setSelectionIndex={setSelectionIndex}
            />
          ))}
    </div>
  );
};
