import React, { memo, useState, useCallback, useMemo, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { CheckboxButton } from '@librechat/client';
import { ArtifactModes } from 'librechat-data-provider';
import { WandSparkles, ChevronDown } from 'lucide-react';
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
  const [isButtonExpanded, setIsButtonExpanded] = useState(false);

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
      setIsButtonExpanded(false);
    } else {
      debouncedChange({ value: ArtifactModes.DEFAULT });
    }
  }, [isEnabled, debouncedChange]);

  const handleMenuButtonClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsButtonExpanded(!isButtonExpanded);
    },
    [isButtonExpanded],
  );

  useEffect(() => {
    if (!isPopoverOpen) {
      setIsButtonExpanded(false);
    }
  }, [isPopoverOpen]);

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
        icon={<WandSparkles className="icon-md" aria-hidden="true" />}
      />

      {isEnabled && (
        <Ariakit.MenuProvider open={isPopoverOpen} setOpen={setIsPopoverOpen}>
          <Ariakit.MenuButton
            className={cn(
              'w-7 rounded-l-none rounded-r-full border-b border-l-0 border-r border-t border-border-light md:w-6',
              'border-amber-600/40 bg-amber-500/10 hover:bg-amber-700/10',
              'transition-colors',
            )}
            onClick={handleMenuButtonClick}
          >
            <ChevronDown
              className={cn(
                'ml-1 h-4 w-4 text-text-secondary transition-transform duration-300 md:ml-0.5',
                isButtonExpanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </Ariakit.MenuButton>

          <Ariakit.Menu
            gutter={4}
            className={cn(
              'animate-popover-top-left z-50 flex min-w-[250px] flex-col rounded-xl',
              'border border-border-light bg-surface-secondary shadow-lg',
            )}
            portal={true}
            unmountOnHide={true}
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
                className={cn(
                  'mb-1 flex items-center justify-between gap-2 rounded-lg px-2 py-2',
                  'cursor-pointer bg-surface-secondary text-text-primary outline-none transition-colors',
                  'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
                  isShadcnEnabled && 'bg-surface-active',
                )}
              >
                <span className="text-sm">{localize('com_ui_include_shadcnui' as any)}</span>
                <div className="ml-auto flex items-center">
                  <Ariakit.MenuItemCheck checked={isShadcnEnabled} />
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
                  'mb-1 flex items-center justify-between gap-2 rounded-lg px-2 py-2',
                  'cursor-pointer bg-surface-secondary text-text-primary outline-none transition-colors',
                  'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
                  isCustomEnabled && 'bg-surface-active',
                )}
              >
                <span className="text-sm">{localize('com_ui_custom_prompt_mode' as any)}</span>
                <div className="ml-auto flex items-center">
                  <Ariakit.MenuItemCheck checked={isCustomEnabled} />
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
