import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronRight, WandSparkles } from 'lucide-react';
import { ArtifactModes } from 'librechat-data-provider';
import { PinIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ArtifactsSubMenuProps {
  isArtifactsPinned: boolean;
  setIsArtifactsPinned: (value: boolean) => void;
  artifactsMode: string;
  handleArtifactsToggle: () => void;
  handleShadcnToggle: () => void;
  handleCustomToggle: () => void;
}

const ArtifactsSubMenu = ({
  isArtifactsPinned,
  setIsArtifactsPinned,
  artifactsMode,
  handleArtifactsToggle,
  handleShadcnToggle,
  handleCustomToggle,
  ...props
}: ArtifactsSubMenuProps) => {
  const localize = useLocalize();

  const menuStore = Ariakit.useMenuStore({
    focusLoop: true,
    showTimeout: 100,
    placement: 'right',
  });

  const isEnabled = artifactsMode !== '' && artifactsMode !== undefined;
  const isShadcnEnabled = artifactsMode === ArtifactModes.SHADCNUI;
  const isCustomEnabled = artifactsMode === ArtifactModes.CUSTOM;

  return (
    <Ariakit.MenuProvider store={menuStore}>
      <Ariakit.MenuItem
        {...props}
        hideOnClick={false}
        render={
          <Ariakit.MenuButton
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              handleArtifactsToggle();
            }}
            onMouseEnter={() => {
              if (isEnabled) {
                menuStore.show();
              }
            }}
            className="flex w-full cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-surface-hover"
          />
        }
      >
        <div className="flex items-center gap-2">
          <WandSparkles className="icon-md" />
          <span>{localize('com_ui_artifacts')}</span>
          {isEnabled && <ChevronRight className="ml-auto h-3 w-3" />}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsArtifactsPinned(!isArtifactsPinned);
          }}
          className={cn(
            'rounded p-1 transition-all duration-200',
            'hover:bg-surface-tertiary hover:shadow-sm',
            !isArtifactsPinned && 'text-text-secondary hover:text-text-primary',
          )}
          aria-label={isArtifactsPinned ? 'Unpin' : 'Pin'}
        >
          <div className="h-4 w-4">
            <PinIcon unpin={isArtifactsPinned} />
          </div>
        </button>
      </Ariakit.MenuItem>

      {isEnabled && (
        <Ariakit.Menu
          portal={true}
          unmountOnHide={true}
          className={cn(
            'animate-popover-left z-50 ml-3 flex min-w-[250px] flex-col rounded-xl',
            'border border-border-light bg-surface-secondary px-1.5 py-1 shadow-lg',
          )}
        >
          <div className="px-2 py-1.5">
            <div className="mb-2 text-xs font-medium text-text-secondary">
              {localize('com_ui_artifacts_options')}
            </div>

            {/* Include shadcn/ui Option */}
            <Ariakit.MenuItem
              hideOnClick={false}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleShadcnToggle();
              }}
              disabled={isCustomEnabled}
              className={cn(
                'mb-1 flex items-center justify-between rounded-lg px-2 py-2',
                'cursor-pointer text-text-primary outline-none transition-colors',
                'hover:bg-black/[0.075] dark:hover:bg-white/10',
                'data-[active-item]:bg-black/[0.075] dark:data-[active-item]:bg-white/10',
                isCustomEnabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <div className="flex items-center gap-2">
                <Ariakit.MenuItemCheck checked={isShadcnEnabled} />
                <span className="text-sm">{localize('com_ui_include_shadcnui' as any)}</span>
              </div>
            </Ariakit.MenuItem>

            {/* Custom Prompt Mode Option */}
            <Ariakit.MenuItem
              hideOnClick={false}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleCustomToggle();
              }}
              className={cn(
                'flex items-center justify-between rounded-lg px-2 py-2',
                'cursor-pointer text-text-primary outline-none transition-colors',
                'hover:bg-black/[0.075] dark:hover:bg-white/10',
                'data-[active-item]:bg-black/[0.075] dark:data-[active-item]:bg-white/10',
              )}
            >
              <div className="flex items-center gap-2">
                <Ariakit.MenuItemCheck checked={isCustomEnabled} />
                <span className="text-sm">{localize('com_ui_custom_prompt_mode' as any)}</span>
              </div>
            </Ariakit.MenuItem>
          </div>
        </Ariakit.Menu>
      )}
    </Ariakit.MenuProvider>
  );
};

export default React.memo(ArtifactsSubMenu);
