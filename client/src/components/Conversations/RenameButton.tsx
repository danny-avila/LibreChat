import type { MouseEvent, ReactElement } from 'react';
import { EditIcon, CheckMark } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface RenameButtonProps {
  renaming: boolean;
  renameHandler: (e: MouseEvent<HTMLButtonElement>) => void;
  onRename: (e: MouseEvent<HTMLButtonElement>) => void;
  appendLabel?: boolean;
  className?: string;
}

export default function RenameButton({
  renaming,
  renameHandler,
  onRename,
  appendLabel = false,
  className = '',
}: RenameButtonProps): ReactElement {
  const localize = useLocalize();
  const handler = renaming ? onRename : renameHandler;

  return (
    <button
      className={cn(
        'group m-1.5 flex w-full cursor-pointer items-center gap-2 rounded p-2.5 text-sm hover:bg-gray-200 focus-visible:bg-gray-200 focus-visible:outline-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600 dark:focus-visible:bg-gray-600',
        className,
      )}
      onClick={handler}
    >
      {renaming ? (
        <CheckMark />
      ) : appendLabel ? (
        <>
          <EditIcon /> {localize('com_ui_rename')}
        </>
      ) : (
        <EditIcon />
      )}
    </button>
  );
}
