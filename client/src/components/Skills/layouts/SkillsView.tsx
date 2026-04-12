import { useCallback } from 'react';
import { Spinner } from '@librechat/client';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useAuthContext, useHasAccess, useLocalize, useSkillPermissions } from '~/hooks';
import { useGetSkillQuery, useListSkillFilesQuery } from '~/data-provider';
import SkillsSidePanel from '~/components/Skills/sidebar/SkillsSidePanel';
import CreateSkillForm from '~/components/Skills/forms/CreateSkillForm';
import SkillState from '~/components/Skills/display/SkillState';
import SkillForm from '~/components/Skills/forms/SkillForm';
import { SkillFileTree } from '~/components/Skills/tree';

const NEW_SENTINEL = 'new';

function NewSkillPanel() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 overflow-y-auto bg-presentation">
      <CreateSkillForm onSuccess={(skill) => navigate(`/skills/${skill._id}`)} />
    </div>
  );
}

function SkillDetailPanel({ skillId }: { skillId: string }) {
  const localize = useLocalize();
  const skillQuery = useGetSkillQuery(skillId);
  const skill = skillQuery.data;
  const filesQuery = useListSkillFilesQuery(skillId, { enabled: !!skill });
  const files = filesQuery.data?.files ?? [];
  const showFileTree = files.length > 0;
  const permissions = useSkillPermissions(skill);

  if (skillQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-presentation">
        <Spinner className="text-text-secondary" aria-label={localize('com_ui_loading')} />
      </div>
    );
  }

  if (skillQuery.isError || !skill) {
    return (
      <div className="flex-1 bg-presentation">
        <SkillState
          variant="error"
          title={localize('com_ui_skill_not_found')}
          description={localize('com_ui_skill_not_found_description')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-presentation">
      {showFileTree && (
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
            <SkillFileTree skillId={skill._id} files={files} canEdit={permissions.canEdit} />
          </div>
        </aside>
      )}
      <div className="flex-1 overflow-y-auto">
        <SkillForm skillId={skill._id} />
      </div>
    </div>
  );
}

function EmptyState() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const handleCreate = useCallback(() => navigate('/skills/new'), [navigate]);
  return (
    <div className="flex-1 bg-presentation">
      <SkillState
        title={localize('com_ui_skills_empty')}
        description={localize('com_ui_skills_add_first')}
        actionLabel={localize('com_ui_skills_new')}
        onAction={handleCreate}
      />
    </div>
  );
}

export default function SkillsView() {
  const params = useParams();
  const localize = useLocalize();
  const { user, roles } = useAuthContext();

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });

  const rolesLoaded = user?.role != null && roles?.[user.role] != null;

  if (!rolesLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-presentation">
        <Spinner className="text-text-secondary" aria-label={localize('com_ui_loading')} />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/c/new" replace />;
  }

  const skillId = params.skillId;
  let mainPanel: JSX.Element;
  if (skillId === NEW_SENTINEL) {
    mainPanel = <NewSkillPanel />;
  } else if (skillId) {
    mainPanel = <SkillDetailPanel skillId={skillId} />;
  } else {
    mainPanel = <EmptyState />;
  }

  return (
    <div className="flex h-full w-full bg-presentation" role="main">
      <aside
        className="hidden w-72 shrink-0 flex-col border-r border-border-light lg:flex"
        aria-label={localize('com_ui_skills')}
      >
        <SkillsSidePanel />
      </aside>
      {mainPanel}
    </div>
  );
}
