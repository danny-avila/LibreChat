import React from 'react';

interface SocialButtonProps {
    id: string;
    enabled: boolean;
    serverDomain?: string;
    oauthPath?: string;
    Icon: React.ComponentType;
    label: string;
    onClick?: () => void;
}

const SocialButton: React.FC<SocialButtonProps> = ({
  id,
  enabled,
  serverDomain,
  oauthPath,
  Icon,
  label,
  onClick,
}) => {
  if (!enabled) {return null;}

  // If an onClick is provided, render a button; otherwise, render an anchor link
  if (onClick) {
    return (
      <div className="mt-2 flex gap-x-2">
        <button
          type="button"
          aria-label={label}
          className="flex w-full items-center space-x-3 rounded-2xl border border-border-light bg-surface-primary px-5 py-3 text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
          onClick={onClick}
          data-testid={id}
        >
          <Icon />
          <p>{label}</p>
        </button>
      </div>
    );
  }

  // Fallback: normal social login link
  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={label}
        className="flex w-full items-center space-x-3 rounded-2xl border border-border-light bg-surface-primary px-5 py-3 text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
      >
        <Icon />
        <p>{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
