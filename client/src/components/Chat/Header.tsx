import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { ContextType } from '~/common';
import { EndpointsMenu, ModelSpecsMenu, PresetsMenu, HeaderNewChat } from './Menus';
import ExportAndShareMenu from './ExportAndShareMenu';
import HeaderOptions from './Input/HeaderOptions';
import AddMultiConvo from './AddMultiConvo';
import { useMediaQuery } from '~/hooks';

const defaultInterface = getConfigDefaults().interface;

export default function Header() {
  const { data: startupConfig } = useGetStartupConfig();
  const { navVisible } = useOutletContext<ContextType>();
  const modelSpecs = useMemo(() => startupConfig?.modelSpecs?.list ?? [], [startupConfig]);
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-white p-2 font-semibold dark:bg-gray-800 dark:text-white">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          {!navVisible && <HeaderNewChat />}
          {interfaceConfig.endpointsMenu && <EndpointsMenu />}
          {modelSpecs?.length > 0 && <ModelSpecsMenu modelSpecs={modelSpecs} />}
          {<HeaderOptions interfaceConfig={interfaceConfig} />}
          {interfaceConfig.presets && <PresetsMenu />}
          {isSmallScreen && (
            <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
              className="pl-0"
            />
          )}
          <AddMultiConvo />
        </div>
        {!isSmallScreen && (
          <ExportAndShareMenu isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false} />
        )}
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
