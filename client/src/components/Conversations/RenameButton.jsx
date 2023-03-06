import React from 'react';
import RenameIcon from '../svg/RenameIcon';
import CheckMark from '../svg/CheckMark';

export default function RenameButton({ renaming, renameHandler, onRename }) {
  const handler = renaming ? onRename : renameHandler;

  return (
    <button className="p-1 hover:text-white" onClick={handler}>
      {renaming ? <CheckMark /> : <RenameIcon />}
    </button>
  );
}
