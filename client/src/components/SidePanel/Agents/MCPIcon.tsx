import { useState, useEffect, useRef } from 'react';
import { Button, SquirclePlusIcon } from '@librechat/client';
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

  return (
    <div className="flex items-center gap-4">
      <Button
        variant="ghost"
        onClick={handleClick}
        aria-label={localize('com_ui_upload_icon')}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border-medium bg-surface-secondary p-0 hover:bg-surface-hover"
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
      </Button>
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
