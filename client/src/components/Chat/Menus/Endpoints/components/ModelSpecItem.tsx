import React, { useRef, useState, useEffect } from 'react';
import { CheckCircle2, Pin, PinOff } from 'lucide-react';
import { VisuallyHidden } from '@ariakit/react';
import type { TModelSpec } from 'librechat-data-provider';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { useFavorites, useLocalize } from '~/hooks';
import SpecIcon from './SpecIcon';
import { cn } from '~/utils';

interface ModelSpecItemProps {
  spec: TModelSpec;
  isSelected: boolean;
}

export function ModelSpecItem({ spec, isSelected }: ModelSpecItemProps) {
  const localize = useLocalize();
  const { handleSelectSpec, endpointsConfig } = useModelSelectorContext();
  const { isFavoriteSpec, toggleFavoriteSpec } = useFavorites();
  const { showIconInMenu = true } = spec;

  const itemRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const element = itemRef.current;
    if (!element) {
      return;
    }

    const observer = new MutationObserver(() => {
      setIsActive(element.hasAttribute('data-active-item'));
    });

    observer.observe(element, { attributes: true, attributeFilter: ['data-active-item'] });
    setIsActive(element.hasAttribute('data-active-item'));

    return () => observer.disconnect();
  }, []);

  const isFavorite = isFavoriteSpec(spec.name);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteSpec(spec.name);
  };

  return (
    <MenuItem
      ref={itemRef}
      key={spec.name}
      onClick={() => handleSelectSpec(spec)}
      aria-selected={isSelected || undefined}
      className={cn(
        'group flex w-full cursor-pointer items-center justify-between rounded-lg px-2 text-sm',
      )}
    >
      <div
        className={cn(
          'flex w-full min-w-0 gap-2 px-1 py-1',
          spec.description ? 'items-start' : 'items-center',
        )}
      >
        {showIconInMenu && (
          <div className="flex-shrink-0">
            <SpecIcon currentSpec={spec} endpointsConfig={endpointsConfig} />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-left">{spec.label}</span>
          {spec.description && (
            <span className="break-words text-xs font-normal">{spec.description}</span>
          )}
        </div>
      </div>
      <button
        tabIndex={isActive ? 0 : -1}
        onClick={handleFavoriteClick}
        aria-label={isFavorite ? localize('com_ui_unpin') : localize('com_ui_pin')}
        className={cn(
          'rounded-md p-1 hover:bg-surface-hover',
          isFavorite ? 'visible' : 'invisible group-hover:visible group-data-[active-item]:visible',
        )}
      >
        {isFavorite ? (
          <PinOff className="h-4 w-4 text-text-secondary" />
        ) : (
          <Pin className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        )}
      </button>
      {isSelected && (
        <>
          <CheckCircle2
            className="size-4 shrink-0 self-center text-text-primary"
            aria-hidden="true"
          />
          <VisuallyHidden>{localize('com_a11y_selected')}</VisuallyHidden>
        </>
      )}
    </MenuItem>
  );
}

export function renderModelSpecs(specs: TModelSpec[], selectedSpec: string) {
  if (!specs || specs.length === 0) {
    return null;
  }

  return specs.map((spec) => (
    <ModelSpecItem key={spec.name} spec={spec} isSelected={selectedSpec === spec.name} />
  ));
}
