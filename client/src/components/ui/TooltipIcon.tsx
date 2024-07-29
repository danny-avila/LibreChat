import { ReactElement } from 'react';
import {
  Dialog,
  DialogTrigger,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { CrossIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

export default function TooltipIcon({
  disabled,
  appendLabel = false,
  title,
  className = '',
  confirm,
  confirmMessage,
  icon,
}: {
  disabled: boolean;
  title: string;
  appendLabel?: boolean;
  className?: string;
  confirm?: () => void;
  confirmMessage?: ReactElement;
  icon?: ReactElement;
}) {
  const localize = useLocalize();

  const renderDeleteButton = () => {
    if (appendLabel) {
      return (
        <>
          {icon} {localize('com_ui_delete')}
        </>
      );
    }
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{icon}</span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={0}>
            {localize('com_ui_delete')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (!confirmMessage) {
    return (
      <button className={className} onClick={confirm}>
        {disabled ? <CrossIcon /> : renderDeleteButton()}
      </button>
    );
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className={className}>{disabled ? <CrossIcon /> : renderDeleteButton()}</button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={title}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">{confirmMessage}</div>
            </div>
          </>
        }
        selection={{
          selectHandler: confirm,
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </Dialog>
  );
}
