import type { MouseEvent, ReactElement } from 'react';
import { RenameIcon, CheckMark } from '~/components/svg';

interface RenameButtonProps {
  renaming: boolean;
  renameHandler: (e: MouseEvent<HTMLButtonElement>) => void;
  onRename: (e: MouseEvent<HTMLButtonElement>) => void;
  twcss?: string;
}

export default function RenameButton({
  renaming,
  renameHandler,
  onRename,
  twcss,
}: RenameButtonProps): ReactElement {
  const handler = renaming ? onRename : renameHandler;
  const classProp: { className?: string } = { className: 'p-1 hover:text-white' };
  if (twcss) {
    classProp.className = twcss;
  }
  return (
    <button {...classProp} onClick={handler}>
      {renaming ? <CheckMark /> : <RenameIcon />}
    </button>
  );
}
