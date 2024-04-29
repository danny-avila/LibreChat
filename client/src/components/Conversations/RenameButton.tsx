import type { MouseEvent, ReactElement } from 'react';
import { EditIcon, CheckMark } from '~/components/svg';
import { useLocalize } from '~/hooks';

interface RenameButtonProps {
  renaming: boolean;
  renameHandler: (e: MouseEvent<HTMLButtonElement>) => void;
  onRename: (e: MouseEvent<HTMLButtonElement>) => void;
  twcss?: string;
  appendLabel?: boolean;
}

export default function RenameButton({
  renaming,
  renameHandler,
  onRename,
  twcss,
  appendLabel = false,
}: RenameButtonProps): ReactElement {
  const localize = useLocalize();
  const handler = renaming ? onRename : renameHandler;
  const classProp: { className?: string } = {
    className: 'p-1 hover:text-black dark:hover:text-white',
  };
  if (twcss) {
    classProp.className = twcss;
  }
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
