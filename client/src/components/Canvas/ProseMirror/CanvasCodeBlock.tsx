import React, { useState, useRef } from "react";
import copy from "copy-to-clipboard";
import { CheckMark } from "~/components/svg";
import Clipboard from "~/components/svg/Clipboard";
import { useLocalize } from "~/hooks";
import { cn } from "~/utils";

interface CanvasCodeBlockProps {
  language?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Rich code block component for Canvas - matches main chat styling
 * Provides copy functionality and beautiful presentation while maintaining editability
 */
export const CanvasCodeBlock: React.FC<CanvasCodeBlockProps> = ({
  language = "text",
  children,
  className,
}) => {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const handleCopy = async () => {
    const codeString = codeRef.current?.textContent;
    if (codeString != null) {
      setIsCopied(true);
      copy(codeString.trim(), { format: "text/plain" });

      setTimeout(() => {
        setIsCopied(false);
      }, 3000);
    }
  };

  return (
    <div className="canvas-code-block w-full rounded-md bg-gray-900 text-xs text-white/80 my-4">
      {/* Code header bar with language and copy button */}
      <div className="relative flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200">
        <span className="font-medium">{language}</span>
        <button
          type="button"
          className="ml-auto flex gap-2 items-center hover:text-white transition-colors"
          onClick={handleCopy}
          title={isCopied ? "Copied!" : "Copy code"}
        >
          {isCopied ? (
            <>
              <CheckMark className="h-[18px] w-[18px]" />
              <span>{localize("com_ui_copied")}</span>
            </>
          ) : (
            <>
              <Clipboard />
              <span>{localize("com_ui_copy_code")}</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <div className="overflow-y-auto p-4">
        <code
          ref={codeRef}
          className={cn(
            "hljs block text-white/80 font-mono text-xs leading-relaxed whitespace-pre overflow-x-auto",
            `language-${language}`,
            className,
          )}
        >
          {children}
        </code>
      </div>
    </div>
  );
};

export default CanvasCodeBlock;
