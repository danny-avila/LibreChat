import { useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import PageHeader from '~/components/ui/PageHeader';
import EmptyPromptPreview from '../display/EmptyPromptPreview';
import CreatePromptForm from '../forms/CreatePromptForm';
import { useHasAccess, useLocalize } from '~/hooks';
import PromptForm from '../forms/PromptForm';

export default function InlinePromptsView() {
  const localize = useLocalize();
  const { promptId } = useParams();
  const navigate = useNavigate();
  const isNew = promptId === undefined;

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });

  const handleCreateSuccess = useCallback(
    (groupId: string) => {
      navigate(`/prompts/${groupId}`, { replace: true });
    },
    [navigate],
  );

  if (!hasAccess) {
    return <Navigate to="/c/new" replace />;
  }

  if (isNew && !hasCreateAccess) {
    return <EmptyPromptPreview />;
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <PageHeader title={localize('com_ui_prompts')} />
      <div className="flex w-full flex-1 flex-col p-6">
        {isNew ? (
          <CreatePromptForm onSuccess={handleCreateSuccess} />
        ) : (
          <PromptForm promptId={promptId} />
        )}
      </div>
    </main>
  );
}
