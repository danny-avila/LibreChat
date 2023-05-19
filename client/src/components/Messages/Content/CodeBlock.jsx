import React, { useRef, useState } from 'react';
import Clipboard from '~/components/svg/Clipboard';
import CheckMark from '~/components/svg/CheckMark';
import { InfoIcon } from 'lucide-react';
import { cn } from '~/utils/';

const CodeBar = React.memo(({ lang, codeRef, plugin = null }) => {
  const [isCopied, setIsCopied] = useState(false);
  return (
    <div className="relative flex items-center rounded-tl-md rounded-tr-md bg-gray-800 px-4 py-2 font-sans text-xs text-gray-200">
      <span className="">{lang}</span>
      {plugin ? (
        <InfoIcon className="ml-auto flex h-4 w-4 gap-2 text-white/50" />
      ) : (
        <button
          className="ml-auto flex gap-2"
          onClick={async () => {
            const codeString = codeRef.current?.textContent;
            if (codeString)
              navigator.clipboard.writeText(codeString).then(() => {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 3000);
              });
          }}
        >
          {isCopied ? (
            <>
              <CheckMark />
              Copied!
            </>
          ) : (
            <>
              <Clipboard />
              Copy code
            </>
          )}
        </button>
      )}
    </div>
  );
});

const CodeBlock = ({ lang, codeChildren, classProp = '', plugin = null }) => {
  const codeRef = useRef(null);
  const language = plugin ? 'json' : lang;

  return (
    <div className="rounded-md bg-black">
      <CodeBar lang={lang} codeRef={codeRef} plugin={plugin} />
      <div className={cn(classProp, 'overflow-y-auto p-4')}>
        <code ref={codeRef} className={`hljs !whitespace-pre language-${language}`}>
          {codeChildren}
        </code>
      </div>
    </div>
  );
};

export default CodeBlock;
