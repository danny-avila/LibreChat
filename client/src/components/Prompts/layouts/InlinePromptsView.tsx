import { useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';
import CreatePromptForm from '../forms/CreatePromptForm';
import PromptForm from '../forms/PromptForm';

export default function InlinePromptsView() {
  const { promptId } = useParams();
  const navigate = useNavigate();
  const isNew = promptId === undefined;

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
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

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
      {isNew ? (
        <CreatePromptForm onSuccess={handleCreateSuccess} />
      ) : (
        <PromptForm promptId={promptId} />
      )}
    </div>
  );
}
