import React from 'react';
import RenameIcon from '../svg/RenameIcon';
import CheckMark from '../svg/CheckMark';

export default function RenameButton({ renaming, renameHandler, onRename, twcss }) {
  const handler = renaming ? onRename : renameHandler;
  const classProp = { className: 'p-1 hover:text-white' };
  if (twcss) {
    classProp.className = twcss;
  }
  return (
    <button
      {...classProp}
      onClick={handler}
    >
      {renaming ? <CheckMark /> : <RenameIcon />}
    </button>
  );
}
