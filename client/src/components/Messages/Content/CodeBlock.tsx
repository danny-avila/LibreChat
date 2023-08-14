import React, { useRef, useState, RefObject } from 'react';
import copy from 'copy-to-clipboard';
import { Clipboard, CheckMark } from '~/components';
import { InfoIcon } from 'lucide-react';
import { cn } from '~/utils/';

interface CodeBarProps {
  lang: string;
  codeRef: RefObject<HTMLElement>;
  plugin?: boolean;
}

const CodeBar: React.FC<CodeBarProps> = React.memo(({ lang, codeRef, plugin = null }) => {
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
            if (codeString) {
              setIsCopied(true);
              copy(codeString);

              setTimeout(() => {
                setIsCopied(false);
              }, 3000);
            }
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

interface CodeBlockProps {
  lang: string;
  codeChildren: string;
  classProp?: string;
  plugin?: boolean;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  lang,
  codeChildren,
  classProp = '',
  plugin = null,
}) => {
  const codeRef = useRef<HTMLElement>(null);
  const language = plugin ? 'json' : lang;

  return (
    <div className="rounded-md bg-black">
      <CodeBar lang={lang} codeRef={codeRef} plugin={!!plugin} />
      <div className={cn(classProp, 'overflow-y-auto p-4')}>
        <code ref={codeRef} className={`hljs !whitespace-pre language-${language}`}>
          {codeChildren}
        </code>
      </div>
    </div>
  );
};

export default CodeBlock;
