import { useMemo, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils';
import GroupsSidePanel from './GroupsSidePanel';
import GroupsBreadcrumb from './GroupsBreadcrumb';

export default function GroupsView() {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isDetailView = useMemo(() => !!(params.groupId || params['*'] === 'new'), [params]);
  
  // Check if user is admin
  const isAdmin = user?.role === SystemRoles.ADMIN;
  
  // Temporarily disable admin check for debugging
  console.log('Debug - User object:', user);
  console.log('Debug - User role:', user?.role);
  console.log('Debug - SystemRoles.ADMIN:', SystemRoles.ADMIN);
  console.log('Debug - isAdmin:', isAdmin);

  // Temporarily disable redirect for debugging
  // useEffect(() => {
  //   let timeoutId: ReturnType<typeof setTimeout>;
  //   if (!isAdmin) {
  //     console.log('Debug - User is not admin, redirecting...');
  //     timeoutId = setTimeout(() => {
  //       navigate('/c/new');
  //     }, 1000);
  //   }
  //   return () => {
  //     clearTimeout(timeoutId);
  //   };
  // }, [isAdmin, navigate]);

  // Temporarily comment out admin check
  // if (!isAdmin) {
  //   return null;
  // }

  return (
    <div className="flex h-screen w-full flex-col bg-surface-primary p-0 lg:p-2">
      <GroupsBreadcrumb />
      <div className="flex w-full flex-grow flex-row divide-x overflow-hidden dark:divide-gray-600">
        <GroupsSidePanel isDetailView={isDetailView} />
        <div
          className={cn(
            'scrollbar-gutter-stable w-full overflow-y-auto lg:w-3/4 xl:w-3/4',
            isDetailView ? 'block' : 'hidden md:block',
          )}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}