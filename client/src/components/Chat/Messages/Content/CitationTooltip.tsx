import React, { useState, useEffect } from 'react';
import { useLocalize } from '~/hooks';

const CitationTooltip = ({ citation, isVisible, position }) => {
  const localize = useLocalize();
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isVisible && position) {
      const updatePosition = () => {
        const tooltipWidth = 320;
        const tooltipHeight = 120;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let xPos = position.x;
        if (xPos + tooltipWidth > viewportWidth - 20) {
          xPos = Math.max(20, viewportWidth - tooltipWidth - 20);
        }

        let yPos = position.y + 20;
        if (yPos + tooltipHeight > viewportHeight - 20) {
          yPos = Math.max(20, position.y - tooltipHeight - 10);
        }

        setTooltipPosition({ x: xPos, y: yPos });
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      return () => window.removeEventListener('resize', updatePosition);
    }
  }, [isVisible, position]);

  if (!isVisible || !citation) {
    return null;
  }

  let displayUrl = citation;
  let favicon = '';

  try {
    const urlObj = new URL(citation);
    displayUrl = urlObj.hostname;
    favicon = `https://www.google.com/s2/favicons?domain=${displayUrl}&sz=64`;
  } catch (e) {
    // URL invalide, on garde la citation telle quelle
  }

  return (
    <div
      className="fixed z-50 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden transition-opacity duration-150"
      style={{
        top: `${tooltipPosition.y}px`,
        left: `${tooltipPosition.x}px`,
        width: '320px',
        opacity: isVisible ? 1 : 0,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      }}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          {favicon ? (
            <img
              src={favicon}
              alt=""
              className="w-4 h-4 flex-shrink-0 rounded-sm"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-4 h-4 flex-shrink-0 rounded-full bg-blue-500"></div>
          )}
          <div className="text-gray-700 dark:text-gray-200 text-xs font-medium truncate">
            {displayUrl}
          </div>
        </div>
        <div className="flex items-center">
          <a
            href={citation}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate flex-grow"
          >
            {citation}
          </a>
          <div className="flex-shrink-0 ml-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
            {localize('com_ui_reference')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CitationTooltip;