import React, { useState } from 'react';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Nuovo stato per tenere traccia del bottone attualmente premuto
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
    setActiveButton(id); // Imposta questo bottone come attivo
  };

  const handleMouseUp = () => {
    setIsPressed(false);
    setIsRedirecting(true); // Puoi impostare questo a true quando inizi a reindirizzare l'utente
  };

  const buttonStyles = {
    backgroundColor:
      isPressed && activeButton === id ? '#B9DAE9' : isHovered ? '#E5E5E5' : 'transparent',
    border: isPressed ? '2px solid #B9DAE9' : '1px solid #CCCCCC',
    // Altri stili se necessario
  };

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={`Login with ${label}`}
        className="justify-left flex w-full items-center space-x-3 rounded-md border px-5 py-3 transition-colors"
        href={`${serverDomain}/oauth/${oauthPath}`}
        style={{
          ...buttonStyles,
          transition: 'background-color 0.3s ease, border 0.3s ease',
        }}
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
