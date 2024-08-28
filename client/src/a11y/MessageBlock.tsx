import React from 'react';

const offScreenStyle: React.CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  padding: 0,
  width: '1px',
  position: 'absolute',
};

interface MessageBlockProps {
  message: string;
  'aria-live': 'polite' | 'assertive';
}

const MessageBlock: React.FC<MessageBlockProps> = ({ message, 'aria-live': ariaLive }) => (
  <div style={offScreenStyle} role="log" aria-live={ariaLive}>
    {message}
  </div>
);

export default MessageBlock;
