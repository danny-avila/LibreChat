import React from 'react';

export default function SiblingSwitch({ 
    siblingIdx,
    siblingCount,
    setSiblingIdx
}) {
  const previous = () => {
    setSiblingIdx(siblingIdx - 1);
  }

  const next = () => {
    setSiblingIdx(siblingIdx + 1);
  }
  return siblingCount > 1 ? (
    <>
      <button className="dark:text-white disabled:text-gray-300 dark:disabled:text-gray-400" onClick={previous} disabled={siblingIdx==0}>
        <svg stroke="currentColor" fill="none" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <span className="flex-grow flex-shrink-0">{siblingIdx + 1}/{siblingCount}</span>
      <button className="dark:text-white disabled:text-gray-300 dark:disabled:text-gray-400" onClick={next} disabled={siblingIdx==siblingCount-1}>
        <svg stroke="currentColor" fill="none" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
      </>
  ):null;
}
