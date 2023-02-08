import React from 'react';

export default function NavLink({ svg, text, clickHandler }) {
  const props = {
    className:
      'flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10'
  };

  if (clickHandler) {
    props.onClick = clickHandler;
  }

  return (
    <a {...props}>
      {svg()}
      {text}
    </a>
  );
}
