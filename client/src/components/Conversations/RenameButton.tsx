import type { MouseEvent, ReactElement } from 'react';
import { EditIcon, CheckMark } from '~/components/svg';
import { useLocalize } from '~/hooks';

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
    <button className={className} onClick={handler}>
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
