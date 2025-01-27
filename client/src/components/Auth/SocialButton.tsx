import React from 'react';

// 1) Define the props interface, making onClick optional
interface SocialButtonProps {
    id: string;
    enabled: boolean;
    serverDomain?: string;
    oauthPath?: string;
    Icon: React.ComponentType;
    label: string;
    onClick?: () => void;
}

// 2) Use the interface in your component definition
const SocialButton: React.FC<SocialButtonProps> = ({
  id,
  enabled,
  serverDomain,
  oauthPath,
  Icon,
  label,
  onClick, // optional
}) => {
  if (!enabled) {return null;}

  // If onClick is provided, render a button
  if (typeof onClick === 'function') {
    return (
      <div className="mt-2 flex gap-x-2">
        <button
          aria-label={label}
          className="flex w-full items-center space-x-3 rounded-2xl
                     border border-border-light bg-surface-primary px-5 py-3
                     text-text-primary transition-colors duration-200
                     hover:bg-surface-tertiary"
          onClick={onClick}
          data-testid={id}
          type="button"
        >
          {Icon && <Icon />}
          <p>{label}</p>
        </button>
      </div>
    );
  }

  // Otherwise, render a standard anchor for OAuth
  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={label}
        className="flex w-full items-center space-x-3 rounded-2xl
                   border border-border-light bg-surface-primary px-5 py-3
                   text-text-primary transition-colors duration-200
                   hover:bg-surface-tertiary"
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
      >
        {Icon && <Icon />}
        <p>{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
