import { Menu } from '@headlessui/react';

const MenuItem = ({ children  }) => {
  return (
    <Menu.Item
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </Menu.Item>
  );
};

export default MenuItem;
