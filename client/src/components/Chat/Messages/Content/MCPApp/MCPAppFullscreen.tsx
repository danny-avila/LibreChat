import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface MCPAppFullscreenProps {
  children: React.ReactNode;
  onClose: () => void;
}

export default function MCPAppFullscreen({ children, onClose }: MCPAppFullscreenProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-surface-primary">
      <div className="flex items-center justify-between border-b border-border-medium px-4 py-2">
        <span className="text-sm font-medium text-text-primary">MCP App</span>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          aria-label="Close fullscreen"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 5L5 15M5 5l10 10" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>,
    document.body,
  );
}
