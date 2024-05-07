import type { MouseEvent, ReactElement } from 'react';
import { EditIcon, CheckMark } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface RenameButtonProps {
  renaming: boolean;
  renameHandler: (e: MouseEvent<HTMLButtonElement>) => void;
  onRename: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  appendLabel?: boolean;
}

export default function RenameButton({
  renaming,
  renameHandler,
  onRename,
  className,
  appendLabel = false,
}: RenameButtonProps): ReactElement {
  const localize = useLocalize();
  const handler = renaming ? onRename : renameHandler;
  const classProp: { className?: string } = {
    className: cn(className),
  };

  return (
    <button {...classProp} onClick={handler}>
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
