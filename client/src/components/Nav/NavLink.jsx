import { forwardRef } from 'react';
import { cn } from '~/utils/';

const NavLink = forwardRef((props, ref) => {
  const { svg, text, clickHandler, className = '' } = props;
  const defaultProps = {};

  defaultProps.className = cn(
    'flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10',
    className
  );

  if (clickHandler) {
    defaultProps.onClick = clickHandler;
  }

  return (
    <a {...defaultProps} ref={ref}>
      {svg()}
      {text}
    </a>
  );
});

export default NavLink;
