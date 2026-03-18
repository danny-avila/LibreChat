import React, { memo, useState } from 'react';
import copy from 'copy-to-clipboard';
import { Button } from '@librechat/client';
import { Copy, CircleCheckBig } from 'lucide-react';
import { handleDoubleClick } from '~/utils';
import { useLocalize } from '~/hooks';

type TCodeProps = {
  inline: boolean;
  className?: string;
  children: React.ReactNode;
};

export const code: React.ElementType = memo(({ inline, className, children }: TCodeProps) => {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (inline) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  }

  return <code className={`hljs language-${lang} !whitespace-pre`}>{children}</code>;
});

export const CopyCodeButton: React.FC<{ content: string }> = ({ content }) => {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    copy(content, { format: 'text/plain' });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleCopy}
      aria-label={isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
    >
      {isCopied ? (
        <CircleCheckBig size={16} aria-hidden="true" />
      ) : (
        <Copy size={16} aria-hidden="true" />
      )}
    </Button>
  );
};
