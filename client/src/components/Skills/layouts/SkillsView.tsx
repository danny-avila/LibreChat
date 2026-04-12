import { useCallback } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useGetSkillQuery, useListSkillFilesQuery } from '~/data-provider';
import { useHasAccess, useLocalize, useSkillPermissions } from '~/hooks';
import { SkillFileTree } from '../tree';
import CreateSkillForm from '../forms/CreateSkillForm';
import SkillForm from '../forms/SkillForm';

/**
 * Dedicated `/skills*` route content. The sidebar list lives in the chat
 * side panel via `SkillsAccordion` (see `useSideNavLinks`) so this view
 * only renders the create / detail panel — mirroring how
 * `InlinePromptsView` handles `/prompts*`.
 */
function SkillDetailView({ skillId }: { skillId: string }) {
  const localize = useLocalize();
  const skillQuery = useGetSkillQuery(skillId);
  const skill = skillQuery.data;
  const filesQuery = useListSkillFilesQuery(skillId, { enabled: !!skill });
  const files = filesQuery.data?.files ?? [];
  const showFileTree = files.length > 0;
  const permissions = useSkillPermissions(skill);

  if (!showFileTree) {
    return <SkillForm skillId={skillId} />;
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside
        className="hidden w-64 shrink-0 flex-col border-r border-border-light md:flex"
        aria-label={localize('com_ui_skill_files')}
      >
        <div className="border-b border-border-light px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {localize('com_ui_skill_files')}
          </h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {localize('com_ui_skill_files_multi_hint', { 0: String(files.length) })}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <SkillFileTree skillId={skillId} files={files} canEdit={permissions.canEdit} />
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">
        <SkillForm skillId={skillId} />
      </div>
    </div>
  );
}

export default function SkillsView() {
  const { skillId } = useParams();
  const navigate = useNavigate();
  const isNew = skillId === undefined;

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });

  const handleCreateSuccess = useCallback(
    (newSkillId: string) => {
      navigate(`/skills/${newSkillId}`, { replace: true });
    },
    [navigate],
  );

  if (!hasAccess) {
    return <Navigate to="/c/new" replace />;
  }

  if (isNew && !hasCreateAccess) {
    return <Navigate to="/c/new" replace />;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
      {isNew ? (
        <CreateSkillForm onSuccess={(skill) => handleCreateSuccess(skill._id)} />
      ) : (
        <SkillDetailView skillId={skillId} />
      )}
    </div>
  );
}
