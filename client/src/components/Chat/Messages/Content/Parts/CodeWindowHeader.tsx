import { useRef, useState, useCallback, useEffect } from 'react';
import copy from 'copy-to-clipboard';
import CopyButton from '~/components/Messages/Content/CopyButton';
import LangIcon from '~/components/Messages/Content/LangIcon';
import { useLocalize } from '~/hooks';

interface CodeWindowHeaderProps {
  language: string;
  code: string;
}

export default function CodeWindowHeader({ language, code }: CodeWindowHeaderProps) {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(() => {
    setIsCopied(true);
    copy(code.trim(), { format: 'text/plain' });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsCopied(false), 3000);
  }, [code]);

  return (
    <div className="flex items-center justify-between bg-surface-primary-alt px-1.5 py-1.5 font-sans text-xs text-text-secondary dark:bg-transparent">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <LangIcon lang={language} className="size-3.5 shrink-0" />
        {language}
      </span>
      <CopyButton isCopied={isCopied} onClick={handleCopy} label={localize('com_ui_copy_code')} />
    </div>
  );
}
