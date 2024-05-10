import { FC, forwardRef } from 'react';
import { cn } from '~/utils/';

interface Props {
  svg: () => JSX.Element;
  text: string;
  clickHandler?: () => void;
  className?: string;
  disabled?: boolean;
}

const NavLink: FC<Props> = forwardRef<HTMLAnchorElement, Props>((props, ref) => {
  const { svg, text, clickHandler, disabled, className = '' } = props;
  const defaultProps: {
    className: string;
    onClick?: () => void;
  } = {
    className: cn(
      'flex gap-2 rounded p-2.5 text-sm cursor-pointer focus:ring-0 group items-center transition-colors duration-200 hover:bg-gray-500/10 dark:text-white dark:hover:bg-gray-600',
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
    <a {...defaultProps} ref={ref}>
      {svg()}
      {text}
    </a>
  );
});

export default NavLink;
