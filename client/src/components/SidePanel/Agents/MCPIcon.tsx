import { useState, useEffect, useRef } from 'react';
import SquirclePlusIcon from '~/components/svg/SquirclePlusIcon';
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
      <div
        onClick={handleClick}
        className="bg-token-surface-secondary dark:bg-token-surface-tertiary border-token-border-medium flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-[1.5rem] border-2 border-dashed"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            className="h-full w-full rounded-[1.5rem] object-cover"
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
        <span className="token-text-tertiary text-xs">{localize('com_agents_mcp_icon_size')}</span>
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
