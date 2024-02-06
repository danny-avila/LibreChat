import React, { useState } from 'react';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // New state to keep track of the currently pressed button
  const [activeButton, setActiveButton] = useState(null);

  if (!enabled) {
    return null;
  }

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleMouseDown = () => {
    setIsPressed(true);
    setActiveButton(id);
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  const getButtonStyles = () => {
    const baseStyles = {
      border: '1px solid #CCCCCC',
      transition: 'background-color 0.3s ease, border 0.3s ease',
    };

    if (isPressed && activeButton === id) {
      return {
        ...baseStyles,
        backgroundColor: '#B9DAE9',
        border: '2px solid #B9DAE9',
      };
    }

    if (isHovered) {
      return {
        ...baseStyles,
        backgroundColor: '#E5E5E5',
      };
    }

    return {
      ...baseStyles,
      backgroundColor: 'transparent',
    };
  };

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={`${label}`}
        className="justify-left flex w-full items-center space-x-3 rounded-md border px-5 py-3 transition-colors"
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
        style={getButtonStyles()}
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
