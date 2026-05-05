import React from 'react';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  if (!enabled) {
    return null;
  }

  return (
    <a
      aria-label={`${label}`}
      className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] border border-[rgba(11,47,91,0.14)] bg-white text-[15px] font-semibold text-ink-900 transition-colors duration-200 hover:bg-paper-100 dark:border-white/[0.14] dark:bg-dm-surface dark:text-dm-text dark:hover:bg-dm-surface2"
      href={`${serverDomain}/oauth/${oauthPath}`}
      data-testid={id}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <Icon />
      </span>
      <span>{label}</span>
    </a>
  );
};

export default SocialButton;
