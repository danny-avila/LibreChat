import { useEffect, useMemo, useState, type RefObject } from 'react';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  useToastContext,
} from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import { useAssignConversationToProjectMutation, useProjectsInfiniteQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';

type ProjectButtonProps = {
  conversationId: string;
  chatProjectId?: string | null;
  showProjectDialog?: boolean;
  setShowProjectDialog?: (value: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement>;
  setMenuOpen?: (open: boolean) => void;
};

function ProjectConversationDialog({
  conversationId,
  chatProjectId,
  setMenuOpen,
  setShowProjectDialog,
}: {
  conversationId: string;
  chatProjectId?: string | null;
  setMenuOpen?: (open: boolean) => void;
  setShowProjectDialog: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [selectedProjectId, setSelectedProjectId] = useState(chatProjectId ?? '');
  const assignConversation = useAssignConversationToProjectMutation();
  const { data, fetchNextPage, isFetchingNextPage } = useProjectsInfiniteQuery({
    sortBy: 'name',
    sortDirection: 'asc',
  });

  const projects = useMemo<TChatProject[]>(
    () => data?.pages.flatMap((page) => page.projects) ?? [],
    [data?.pages],
  );
  const hasNextPage = data?.pages[data.pages.length - 1]?.nextCursor != null;

  useEffect(() => {
    setSelectedProjectId(chatProjectId ?? '');
  }, [chatProjectId]);

  const saveProject = () => {
    assignConversation.mutate(
      {
        conversationId,
        projectId: selectedProjectId || null,
      },
      {
        onSuccess: () => {
          setShowProjectDialog(false);
          setMenuOpen?.(false);
          showToast({
            message: localize('com_ui_project_updated'),
            severity: NotificationSeverity.SUCCESS,
            showIcon: true,
          });
        },
        onError: () => {
          showToast({
            message: localize('com_ui_project_update_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  };

  return (
    <OGDialogContent
      id="project-conversation-dialog"
      className="w-11/12 max-w-md"
      showCloseButton={false}
    >
      <OGDialogHeader>
        <OGDialogTitle>{localize('com_ui_change_project')}</OGDialogTitle>
      </OGDialogHeader>
      <label className="flex flex-col gap-2 text-sm text-text-primary">
        {localize('com_ui_select_project')}
        <select
          value={selectedProjectId}
          onChange={(event) => setSelectedProjectId(event.target.value)}
          className="h-10 rounded-lg border border-border-light bg-surface-primary px-3 text-sm outline-none focus:ring-2 focus:ring-ring-primary"
        >
          <option value="">{localize('com_ui_unassigned')}</option>
          {projects.map((project) => (
            <option key={project._id} value={project._id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      {hasNextPage && (
        <button
          type="button"
          className="mt-3 text-sm text-text-secondary hover:text-text-primary"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? localize('com_ui_loading') : localize('com_ui_load_more')}
        </button>
      )}
      <div className="flex justify-end gap-4 pt-4">
        <OGDialogClose asChild>
          <Button aria-label="cancel" variant="outline">
            {localize('com_ui_cancel')}
          </Button>
        </OGDialogClose>
        <Button onClick={saveProject} disabled={assignConversation.isLoading}>
          {assignConversation.isLoading ? <Spinner /> : localize('com_ui_save')}
        </Button>
      </div>
    </OGDialogContent>
  );
}

export default function ProjectButton({
  conversationId,
  chatProjectId,
  setMenuOpen,
  showProjectDialog,
  setShowProjectDialog,
  triggerRef,
}: ProjectButtonProps) {
  if (showProjectDialog === undefined || setShowProjectDialog === undefined) {
    return null;
  }

  if (!conversationId) {
    return null;
  }

  return (
    <OGDialog open={showProjectDialog} onOpenChange={setShowProjectDialog} triggerRef={triggerRef}>
      <ProjectConversationDialog
        conversationId={conversationId}
        chatProjectId={chatProjectId}
        setMenuOpen={setMenuOpen}
        setShowProjectDialog={setShowProjectDialog}
      />
    </OGDialog>
  );
}
