import React, { memo, useState, useCallback, useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { ArtifactModes } from 'librechat-data-provider';
import { WandSparkles, ChevronDown } from 'lucide-react';
import CheckboxButton from '~/components/ui/CheckboxButton';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ArtifactsToggleState {
  enabled: boolean;
  mode: string;
}

function Artifacts() {
  const localize = useLocalize();
  const { artifacts } = useBadgeRowContext();
  const { toggleState, debouncedChange, isPinned } = artifacts;

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const currentState = useMemo<ArtifactsToggleState>(() => {
    if (typeof toggleState === 'string' && toggleState) {
      return { enabled: true, mode: toggleState };
    }
    return { enabled: false, mode: '' };
  }, [toggleState]);

  const isEnabled = currentState.enabled;
  const isShadcnEnabled = currentState.mode === ArtifactModes.SHADCNUI;
  const isCustomEnabled = currentState.mode === ArtifactModes.CUSTOM;

  const handleToggle = useCallback(() => {
    if (isEnabled) {
      debouncedChange({ value: '' });
    } else {
      debouncedChange({ value: ArtifactModes.DEFAULT });
    }
  }, [isEnabled, debouncedChange]);

  const handleShadcnToggle = useCallback(() => {
    if (isShadcnEnabled) {
      debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      debouncedChange({ value: ArtifactModes.SHADCNUI });
    }
  }, [isShadcnEnabled, debouncedChange]);

  const handleCustomToggle = useCallback(() => {
    if (isCustomEnabled) {
      debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      debouncedChange({ value: ArtifactModes.CUSTOM });
    }
  }, [isCustomEnabled, debouncedChange]);

  if (!isEnabled && !isPinned) {
    return null;
  }

  return (
    <div className="flex">
      <CheckboxButton
        className={cn('max-w-fit', isEnabled && 'rounded-r-none border-r-0')}
        checked={isEnabled}
        setValue={handleToggle}
        label={localize('com_ui_artifacts')}
        isCheckedClassName="border-amber-600/40 bg-amber-500/10 hover:bg-amber-700/10"
        icon={<WandSparkles className="icon-md" />}
      />

      {isEnabled && (
        <Ariakit.MenuProvider open={isPopoverOpen} setOpen={setIsPopoverOpen}>
          <Ariakit.MenuButton
            className={cn(
              'w-7 rounded-l-none rounded-r-full border-b border-l-0 border-r border-t border-border-light md:w-6',
              'border-amber-600/40 bg-amber-500/10 hover:bg-amber-700/10',
              'transition-colors',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronDown className="ml-1 h-4 w-4 text-text-secondary md:ml-0" />
          </Ariakit.MenuButton>

          <Ariakit.Menu
            gutter={8}
            className={cn(
              'animate-popover z-50 flex max-h-[300px]',
              'flex-col overflow-auto overscroll-contain rounded-xl',
              'bg-surface-secondary px-1.5 py-1 text-text-primary shadow-lg',
              'border border-border-light',
              'min-w-[250px] outline-none',
            )}
            portal
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
                  'cursor-pointer outline-none transition-colors',
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
                  'cursor-pointer outline-none transition-colors',
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
        </Ariakit.MenuProvider>
      )}
    </div>
  );
}

export default memo(Artifacts);
