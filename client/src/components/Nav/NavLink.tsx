import React, { FC, forwardRef } from 'react';
import { cn } from '~/utils/';

interface Props {
  svg: () => JSX.Element;
  text: string;
  clickHandler?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
}

const NavLink: FC<Props> = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  const { svg, text, clickHandler, disabled, className = '' } = props;
  const defaultProps: {
    className: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  } = {
    className: cn(
      'w-full flex gap-2 rounded p-2.5 text-sm cursor-pointer group items-center transition-colors duration-200 text-text-primary hover:bg-surface-hover',
      className,
      {
        'opacity-50 pointer-events-none': disabled,
      },
    ),
  };

  if (clickHandler) {
    defaultProps.onClick = clickHandler;
  }

  return (
    <button {...defaultProps} ref={ref}>
      {svg()}
      {text}
    </button>
  );
});

export default NavLink;
