import React, { memo, useCallback, useId, useMemo, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { FileCode2, FileImage, ImageDown, LoaderCircle } from 'lucide-react';
import { DropdownPopup, TooltipAnchor, useToastContext } from '@librechat/client';
import type { MermaidDimensions } from '~/utils/diagram/export';
import type { MenuItemProps } from '~/common';
import { downloadMermaidPng, downloadMermaidSvg } from '~/utils/diagram/export';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidExportProps {
  filename: string;
  svg?: string | null;
  dimensions?: MermaidDimensions | null;
  buttonClassName?: string;
  /** Fullscreen re-roots the panel, so a menu portalled to the body would be
   *  rendered outside the visible fullscreen element. */
  portalElement?: HTMLElement | null;
}

function surfaceBackground(): string | undefined {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface-primary-alt')
    .trim();
  if (!value) {
    return undefined;
  }
  if (/^[\d.]+(?:\s+[\d.]+){2}(?:\s*\/\s*[\d.]+%?)?$/.test(value)) {
    return `rgb(${value})`;
  }
  return value.startsWith('var(') ? undefined : value;
}

const MermaidExport = memo(function MermaidExport({
  filename,
  svg,
  dimensions,
  buttonClassName,
  portalElement,
}: MermaidExportProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const isBusy = isExportingPng;
  let liveMessage = exportStatus;
  if (isExportingPng) {
    liveMessage = localize('com_ui_mermaid_exporting_png');
  }

  const showExportError = useCallback(() => {
    setExportStatus(localize('com_ui_mermaid_export_failed'));
    showToast({ status: 'error', message: localize('com_ui_mermaid_export_failed') });
  }, [localize, showToast]);

  const restoreTriggerFocus = useCallback(() => {
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const handleSvgExport = useCallback(() => {
    if (svg == null) {
      return;
    }

    try {
      downloadMermaidSvg(svg, filename, surfaceBackground());
      setExportStatus(localize('com_ui_mermaid_export_complete'));
    } catch {
      showExportError();
    } finally {
      restoreTriggerFocus();
    }
  }, [filename, localize, restoreTriggerFocus, showExportError, svg]);

  const handlePngExport = useCallback(() => {
    if (svg == null || isExportingPng) {
      return;
    }

    setIsExportingPng(true);
    setExportStatus('');
    void downloadMermaidPng(svg, filename, dimensions, surfaceBackground())
      .then(() => setExportStatus(localize('com_ui_mermaid_export_complete')))
      .catch(showExportError)
      .finally(() => setIsExportingPng(false));
    restoreTriggerFocus();
  }, [dimensions, filename, isExportingPng, localize, restoreTriggerFocus, showExportError, svg]);

  const dropdownItems = useMemo<MenuItemProps[]>(() => {
    const statusItems: MenuItemProps[] = [];
    if (isBusy) {
      statusItems.push({
        label: liveMessage,
        disabled: true,
        icon: <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />,
        className: 'text-text-secondary',
      });
    }

    return [
      ...statusItems,
      {
        label: localize('com_ui_export_svg'),
        icon: <FileCode2 className="size-4 text-text-secondary" />,
        disabled: svg == null || isExportingPng,
        onClick: handleSvgExport,
      },
      {
        label: localize('com_ui_export_png'),
        icon: <FileImage className="size-4 text-text-secondary" />,
        disabled: svg == null || isExportingPng,
        onClick: handlePngExport,
      },
    ];
  }, [handlePngExport, handleSvgExport, isBusy, isExportingPng, liveMessage, localize, svg]);

  return (
    <>
      <DropdownPopup
        portal
        focusLoop
        unmountOnHide
        menuId={`mermaid-export-${instanceId}-menu`}
        finalFocus={triggerRef}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        items={dropdownItems}
        portalElement={portalElement}
        className="absolute right-0 top-0 mt-2 min-w-52 motion-reduce:!transition-none"
        trigger={
          <TooltipAnchor
            portalElement={portalElement}
            description={isBusy ? liveMessage : localize('com_ui_export_mermaid')}
            render={
              <Ariakit.MenuButton
                ref={triggerRef}
                aria-label={localize('com_ui_export_mermaid')}
                aria-busy={isBusy || undefined}
                className={cn(
                  'flex items-center justify-center rounded-lg p-1.5 text-text-secondary transition-colors motion-reduce:transition-none',
                  'hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy',
                  buttonClassName,
                )}
              >
                {isBusy ? (
                  <LoaderCircle
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <ImageDown className="size-4" aria-hidden="true" />
                )}
              </Ariakit.MenuButton>
            }
          />
        }
      />
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>
    </>
  );
});

MermaidExport.displayName = 'MermaidExport';

export default MermaidExport;
