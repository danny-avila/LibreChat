import { useRef } from 'react';
import { Save } from 'lucide-react';
import { Portal, Content } from '@radix-ui/react-popover';
import { Button, CrossIcon, useOnClickOutside } from '@librechat/client';
import type { ReactNode } from 'react';
import { cn, removeFocusOutlines } from '~/utils';
import { useLocalize } from '~/hooks';

type TOptionsPopoverProps = {
  children: ReactNode;
  visible: boolean;
  saveAsPreset: () => void;
  closePopover: () => void;
  PopoverButtons: ReactNode;
  presetsDisabled: boolean;
};

export default function OptionsPopover({
  children,
  // endpoint,
  visible,
  saveAsPreset,
  closePopover,
  PopoverButtons,
  presetsDisabled,
}: TOptionsPopoverProps) {
  const popoverRef = useRef(null);
  useOnClickOutside(
    popoverRef,
    () => closePopover(),
    ['dialog-template-content', 'shadcn-button', 'advanced-settings'],
    (_target) => {
      const target = _target as Element;
      if (
        target.id === 'presets-button' ||
        (target.parentNode instanceof Element && target.parentNode.id === 'presets-button')
      ) {
        return false;
      }
      const tagName = target.tagName;
      return tagName === 'path' || tagName === 'svg' || tagName === 'circle';
    },
  );

  const localize = useLocalize();
  const cardStyle =
    'shadow-xl rounded-md min-w-[75px] font-normal bg-surface-secondary border-border-light border text-text-primary';

  if (!visible) {
    return null;
  }

  return (
    <Portal>
      <Content sideOffset={8} align="start" ref={popoverRef} asChild>
        <div className="z-[70] flex w-screen flex-col items-center md:w-full md:px-4">
          <div
            className={cn(
              cardStyle,
              'border-d-0 flex w-full flex-col overflow-hidden rounded-none border-s-0 border-t bg-surface-secondary px-0 pb-[10px] md:rounded-md md:border lg:w-[736px]',
            )}
          >
            <div className="flex w-full items-center bg-surface-tertiary px-2 py-2">
              {presetsDisabled ? null : (
                <Button
                  type="button"
                  className="h-auto w-[150px] justify-start rounded-md border border-border-medium bg-transparent px-2 py-1 text-xs font-normal text-text-primary hover:bg-surface-hover focus-visible:ring-1 focus-visible:ring-ring-primary"
                  onClick={saveAsPreset}
                >
                  <Save className="mr-1 w-[14px]" />
                  {localize('com_endpoint_save_as_preset')}
                </Button>
              )}
              {PopoverButtons}
              <Button
                type="button"
                className={cn(
                  'ml-auto h-auto bg-transparent px-3 py-2 text-xs font-normal text-text-primary hover:bg-surface-hover',
                  removeFocusOutlines,
                )}
                onClick={closePopover}
              >
                <CrossIcon />
              </Button>
            </div>
            <div>{children}</div>
          </div>
        </div>
      </Content>
    </Portal>
  );
}
