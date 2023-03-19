import React, { useState } from 'react';
import Clipboard from '../svg/Clipboard';
import CheckMark from '../svg/CheckMark';

export default function Embed({ children, lang = '', code, matched }) {
  const [buttonText, setButtonText] = useState('Copy code');
  const isClicked = buttonText === 'Copy code';

  const clickHandler = () => {
    navigator.clipboard.writeText(code.trim());
    setButtonText('Copied!');
    setTimeout(() => {
      setButtonText('Copy code');
    }, 3000);
  };

  return (
    <pre>
      <div className="mb-4 rounded-md bg-black">
        <div className="relative flex items-center rounded-tl-md rounded-tr-md bg-gray-800 px-4 py-2 font-sans text-xs text-gray-200">
          <span className="">{lang === 'javascript' && !matched ? '' : lang}</span>
          <button
            className="ml-auto flex gap-2"
            onClick={clickHandler}
            disabled={!isClicked}
          >
            {isClicked ? <Clipboard /> : <CheckMark />}
            {buttonText}
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </pre>
  );
}
