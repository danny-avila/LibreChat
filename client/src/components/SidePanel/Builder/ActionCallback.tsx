import { useState } from 'react';
import { Copy, CopyCheck } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { AuthTypeEnum } from 'librechat-data-provider';
import { useLocalize, useCopyToClipboard } from '~/hooks';
import { useToastContext } from '~/Providers';
import { Button } from '~/components/ui';
import { cn } from '~/utils';

export default function ActionCallback({ action_id }: { action_id?: string }) {
  const localize = useLocalize();
  const { watch } = useFormContext();
  const { showToast } = useToastContext();
  const [isCopying, setIsCopying] = useState(false);
  const callbackURL = `${window.location.protocol}//${window.location.host}/api/actions/${action_id}/oauth/callback`;
  const copyLink = useCopyToClipboard({ text: callbackURL });

  if (!action_id) {
    return null;
  }
  const type = watch('type');
  if (type !== AuthTypeEnum.OAuth) {
    return null;
  }
  return (
    <div className="mb-1.5 flex flex-col space-y-2">
      <label className="font-semibold">{localize('com_ui_callback_url')}</label>
      <div className="relative flex items-center">
        <div className="border-token-border-medium bg-token-surface-primary hover:border-token-border-hover flex h-10 w-full rounded-lg border">
          <div className="flex-1 overflow-hidden">
            <div className="relative w-full">
              <input
                type="text"
                readOnly
                value={callbackURL}
                className="w-full border-0 bg-transparent px-3 py-2 pr-12 text-sm text-text-secondary-alt focus:outline-none"
                style={{ direction: 'rtl' }}
              />
            </div>
          </div>
          <div className="absolute right-0 flex h-full items-center pr-1">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                if (isCopying) {
                  return;
                }
                showToast({ message: localize('com_ui_copied_to_clipboard') });
                copyLink(setIsCopying);
              }}
              className={cn('h-8 rounded-md px-2', isCopying ? 'cursor-default' : '')}
              aria-label={localize('com_ui_copy_link')}
            >
              {isCopying ? <CopyCheck className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
