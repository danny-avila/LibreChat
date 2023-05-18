import React from 'react';

export default function RowButton({ onClick, children, text, className }) {
  return (
    <button
      onClick={onClick}
      className={`input-panel-button btn btn-neutral flex justify-center gap-2 border-0 md:border ${className}`}
      type="button"
    >
      {children}
      <span className="hidden md:block">{text}</span>
      {/* <RegenerateIcon />
<span className="hidden md:block">Regenerate response</span> */}
    </button>
  );
}
