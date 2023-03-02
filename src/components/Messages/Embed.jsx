import React, { useState } from 'react';
import Clipboard from '../svg/Clipboard';

export default function Embed({ children, language = '', matched}) {
  return (
    <pre>
      <div className="mb-4 rounded-md bg-black">
        <div className="relative flex items-center bg-gray-800 px-4 py-2 font-sans text-xs text-gray-200 rounded-tl-md rounded-tr-md">
          <span className="">{ (language === 'javascript' && !matched ? '' : language) }</span>
          <button className="ml-auto flex gap-2">
            <Clipboard />
            Copy code
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          { children }
        </div>
      </div>
    </pre>
  );
}
