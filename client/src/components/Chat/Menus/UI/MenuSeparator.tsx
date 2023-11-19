import type { FC } from 'react';

const MenuSeparator: FC = () => (
  <div
    role="separator"
    aria-orientation="horizontal"
    className="my-1.5 border-b bg-gray-100 dark:border-gray-700"
  />
);

export default MenuSeparator;
