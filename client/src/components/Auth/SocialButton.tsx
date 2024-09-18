import React from 'react';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label, autoRedirect }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [activeButton, setActiveButton] = useState(null);

  if (autoRedirect && typeof window !== 'undefined') {
//        window.location.href = `${serverDomain}/oauth/${oauthPath}`;
  }

  if (!enabled) {
    return null;
  }

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={`${label}`}
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
