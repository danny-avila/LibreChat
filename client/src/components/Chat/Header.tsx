import { getConfigDefaults, Permissions, PermissionTypes } from 'librechat-data-provider';
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ContextType } from '~/common';
import { useGetStartupConfig } from '~/data-provider';
import { useHasAccess, useMediaQuery } from '~/hooks';
import AddMultiConvo from './AddMultiConvo';
import CreateNewChat from './CreateNewChat';
// import ExportAndShareMenu from './ExportAndShareMenu';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { TemporaryChat } from './TemporaryChat';

const defaultInterface = getConfigDefaults().interface;

export default function Header() {
  const { data: startupConfig } = useGetStartupConfig();
  const { navVisible } = useOutletContext<ContextType>();
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const hasAccessToMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-beige p-2 font-semibold text-text-primary dark:bg-gray-800">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-2 flex items-center gap-2">
          {<ModelSelector startupConfig={startupConfig} />}
          {/* {interfaceConfig.presets === true && interfaceConfig.modelSelect && <PresetsMenu />} */}
          {/* {hasAccessToBookmarks === true && <BookmarkMenu />} */}
          {hasAccessToMultiConvo === true && <AddMultiConvo />}
          <CreateNewChat />
          {isSmallScreen && (
            <>
              {/* <ExportAndShareMenu
                isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
              /> */}
              <TemporaryChat />
            </>
          )}
        </div>
        {!isSmallScreen && (
          <div className="flex items-center gap-2">
            {/* <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            /> */}
            <TemporaryChat />
          </div>
        )}
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
