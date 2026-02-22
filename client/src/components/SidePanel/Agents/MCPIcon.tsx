import { useState, useEffect, useRef } from 'react';
import { SquirclePlusIcon } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface MCPIconProps {
  icon?: string;
  onIconChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function MCPIcon({ icon, onIconChange }: MCPIconProps) {
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();

  useEffect(() => {
    if (icon) {
      setPreviewUrl(icon);
    } else {
      setPreviewUrl('');
    }
  }, [icon]);

  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={localize('com_ui_upload_icon')}
        className="bg-token-surface-secondary dark:bg-token-surface-tertiary border-token-border-medium flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed focus:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            className="h-full w-full rounded-xl object-cover"
            alt="MCP Icon"
            width="64"
            height="64"
          />
        ) : (
          <SquirclePlusIcon />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="token-text-secondary text-sm">
          {localize('com_ui_icon')} {localize('com_ui_optional')}
        </span>
        <span className="text-xs text-text-secondary">{localize('com_agents_mcp_icon_size')}</span>
      </div>
      <input
        accept="image/png,.png,image/jpeg,.jpg,.jpeg,image/gif,.gif,image/webp,.webp"
        multiple={false}
        type="file"
        style={{ display: 'none' }}
        onChange={onIconChange}
        ref={fileInputRef}
      />
    </div>
  );
}
