import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getConfigDefaults, PermissionTypes, Permissions } from 'librechat-data-provider';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { ContextType } from '~/common';
import { EndpointsMenu, ModelSpecsMenu, PresetsMenu, HeaderNewChat } from './Menus';
import ExportAndShareMenu from './ExportAndShareMenu';
import { useMediaQuery, useHasAccess, useAuthContext } from '~/hooks';
import HeaderOptions from './Input/HeaderOptions';
import BookmarkMenu from './Menus/BookmarkMenu';
import AddMultiConvo from './AddMultiConvo';
import { SystemRoles } from 'librechat-data-provider';

const defaultInterface = getConfigDefaults().interface;

export default function Header() {
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { navVisible } = useOutletContext<ContextType>();
  const modelSpecs = useMemo(() => startupConfig?.modelSpecs?.list ?? [], [startupConfig]);
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return user?.role === SystemRoles.ADMIN ? (
    <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-white p-2 font-semibold dark:bg-gray-800 dark:text-white">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          {!navVisible && <HeaderNewChat />}
          {interfaceConfig.endpointsMenu === true && <EndpointsMenu />}
          {modelSpecs.length > 0 && <ModelSpecsMenu modelSpecs={modelSpecs} />}
          {<HeaderOptions interfaceConfig={interfaceConfig} />}
          {interfaceConfig.presets === true && <PresetsMenu />}
          {hasAccessToBookmarks === true && <BookmarkMenu />}
          <AddMultiConvo />
          {isSmallScreen && (
            <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            />
          )}
        </div>
        {!isSmallScreen && (
          <ExportAndShareMenu isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false} />
        )}
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  ) : null;
}
