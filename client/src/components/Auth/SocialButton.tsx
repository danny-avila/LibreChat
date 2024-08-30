import React, { useState } from 'react';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [activeButton, setActiveButton] = useState(null);

  if (!enabled) {
    return null;
  }

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (isPressed) {
      setIsPressed(false);
    }
  };

  const handleMouseDown = () => {
    setIsPressed(true);
    setActiveButton(id);
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  const getButtonStyles = () => {
    // Define Tailwind CSS classes based on state
    const baseStyles = 'border border-solid border-gray-300 dark:border-gray-600 transition-colors';

    let dynamicStyles = '';

    if (isPressed && activeButton === id) {
      dynamicStyles = 'bg-blue-200 border-blue-200 dark:bg-blue-900 dark:border-blue-600';
    } else if (isHovered) {
      dynamicStyles = 'bg-gray-100 dark:bg-gray-700';
    }

    return `${baseStyles} ${dynamicStyles}`;
  };

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={`${label}`}
        className={`${getButtonStyles()} flex w-full items-center space-x-3 rounded-md px-5 py-3 text-black transition-colors dark:text-white`}
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <Icon />
        <p>{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
