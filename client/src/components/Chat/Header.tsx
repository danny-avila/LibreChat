import { memo, useMemo } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { X } from 'lucide-react';
import { useMediaQuery, TooltipAnchor } from '@librechat/client';
import { getConfigDefaults, PermissionTypes, Permissions } from 'librechat-data-provider';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import { OpenSidebar, PresetsMenu } from './Menus';
import BookmarkMenu from './Menus/BookmarkMenu';
import { TemporaryChat } from './TemporaryChat';
import AddMultiConvo from './AddMultiConvo';
import { useHasAccess, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

// V1 UX (POP/BETC) : bouton Presets masqué du Header — feature jugée non
// pertinente pour les users V1. Réactiver en passant à `true` ; le composant
// PresetsMenu et toute la logique sous-jacente sont préservés.
const SHOW_PRESETS_BUTTON = false;

function Header() {
  const { data: startupConfig } = useGetStartupConfig();
  const localize = useLocalize();
  const navVisible = useRecoilValue(store.sidebarExpanded);
  const addedConvo = useRecoilValue(store.conversationByIndex(1));
  const setAddedConvo = useSetRecoilState(store.conversationByIndex(1));
  const isComparisonMode = !!addedConvo;

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

  const hasAccessToTemporaryChat = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-10 flex h-[52px] w-full items-center justify-between bg-gradient-to-b from-presentation to-transparent p-2 font-semibold text-text-primary 2xl:via-transparent">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center">
          <OpenSidebar className="md:hidden" />
          {!(navVisible && isSmallScreen) && (
            <div
              className={cn(
                'flex items-center gap-2 pl-2',
                !isSmallScreen ? 'transition-all duration-200 ease-in-out' : '',
              )}
            >
              {isComparisonMode ? (
                <>
                  <ModelSelector
                    startupConfig={startupConfig}
                    index={0}
                    className="max-w-[35vw]"
                  />
                  <span
                    className="px-1 text-xs uppercase text-text-secondary"
                    aria-hidden="true"
                  >
                    {localize('com_ui_versus')}
                  </span>
                  <ModelSelector
                    startupConfig={startupConfig}
                    index={1}
                    className="max-w-[35vw]"
                  />
                  {SHOW_PRESETS_BUTTON && interfaceConfig.presets === true && interfaceConfig.modelSelect && (
                    <PresetsMenu />
                  )}
                  {hasAccessToBookmarks === true && <BookmarkMenu />}
                  <TooltipAnchor
                    description={localize('com_ui_exit_comparison')}
                    role="button"
                    tabIndex={0}
                    aria-label={localize('com_ui_exit_comparison')}
                    onClick={() => setAddedConvo(null)}
                    className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border-light bg-presentation px-3 text-sm text-text-primary transition-all ease-in-out hover:bg-surface-tertiary"
                  >
                    <X className="icon-sm" aria-hidden="true" />
                    <span>{localize('com_ui_exit')}</span>
                  </TooltipAnchor>
                </>
              ) : (
                <>
                  <ModelSelector startupConfig={startupConfig} />
                  {SHOW_PRESETS_BUTTON && interfaceConfig.presets === true && interfaceConfig.modelSelect && (
                    <PresetsMenu />
                  )}
                  {hasAccessToBookmarks === true && <BookmarkMenu />}
                  {hasAccessToMultiConvo === true && <AddMultiConvo />}
                </>
              )}
              {isSmallScreen && (
                <>
                  <ExportAndShareMenu
                    isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
                  />
                  {hasAccessToTemporaryChat === true && <TemporaryChat />}
                </>
              )}
            </div>
          )}
        </div>

        {!isSmallScreen && (
          <div className="flex items-center gap-2">
            <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            />
            {hasAccessToTemporaryChat === true && <TemporaryChat />}
          </div>
        )}
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}

const MemoizedHeader = memo(Header);
MemoizedHeader.displayName = 'Header';

export default MemoizedHeader;
