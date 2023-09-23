import React, { ReactElement } from 'react';
import RenameIcon from '../svg/RenameIcon';
import CheckMark from '../svg/CheckMark';

interface RenameButtonProps {
  renaming: boolean;
  renameHandler: () => void;
  onRename: () => void;
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
