import React from 'react';

export default function SubRow({ children, classes = '', subclasses = '', onClick }) {
  return (
    <div
      className={`flex justify-between ${classes}`}
      onClick={onClick}
    >
      <div className={`flex items-center justify-center gap-1 self-center pt-2 text-xs ${subclasses}`}>
        {children}
      </div>
    </div>
  );
}
