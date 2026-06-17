import { useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import EmptyPromptPreview from '../display/EmptyPromptPreview';
import CreatePromptForm from '../forms/CreatePromptForm';
import { useScopeOverrideFeatureAccess } from '~/hooks';
import PromptForm from '../forms/PromptForm';
import { useGetStartupConfig } from '~/data-provider';

export default function InlinePromptsView() {
  const { promptId } = useParams();
  const navigate = useNavigate();
  const isNew = promptId === undefined;
  const { isLoading: startupLoading } = useGetStartupConfig();

  const hasAccess = useScopeOverrideFeatureAccess(PermissionTypes.PROMPTS);
  const hasCreateAccess = useScopeOverrideFeatureAccess(
    PermissionTypes.PROMPTS,
    Permissions.CREATE,
  );

  const handleCreateSuccess = useCallback(
    (groupId: string) => {
      navigate(`/prompts/${groupId}`, { replace: true });
    },
    [navigate],
  );

  if (startupLoading) {
    return null;
  }

  if (!hasAccess) {
    return <Navigate to="/c/new" replace />;
  }

  if (isNew && !hasCreateAccess) {
    return <EmptyPromptPreview />;
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
