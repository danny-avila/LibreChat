import { useMemo, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import FilterPrompts from '~/components/Prompts/Groups/FilterPrompts';
import DashBreadcrumb from '~/routes/Layouts/DashBreadcrumb';
import { usePromptGroupsNav, useHasAccess } from '~/hooks';
import GroupSidePanel from './Groups/GroupSidePanel';
import { cn } from '~/utils';

export default function PromptsView() {
  const params = useParams();
  const navigate = useNavigate();
  const groupsNav = usePromptGroupsNav();
  const isDetailView = useMemo(() => !!(params.promptId || params['*'] === 'new'), [params]);
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (!hasAccess) {
      timeoutId = setTimeout(() => {
        navigate('/c/new');
      }, 1000);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [hasAccess, navigate]);

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-surface-primary p-0 lg:p-2">
      <DashBreadcrumb />
      <div className="flex w-full grow flex-row divide-x overflow-hidden dark:divide-gray-600">
        <GroupSidePanel isDetailView={isDetailView} {...groupsNav}>
          <div className="mx-2 mt-1 flex flex-row items-center justify-between">
            <FilterPrompts setName={groupsNav.setName} />
          </div>
        </GroupSidePanel>
        <div
          className={cn(
            'scrollbar-gutter-stable w-full overflow-y-auto lg:w-3/4 xl:w-3/4',
            isDetailView ? 'block' : 'hidden md:block',
          )}
        >
          <Outlet context={groupsNav} />
        </div>
      </div>
    </div>
  );
}
