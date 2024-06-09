import React from 'react';

interface AppearanceIconProps {
  className?: string;
}

const AppearanceIcon: React.FC<AppearanceIconProps> = ({ className = '' }) => {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6M7 7a5 5 0 1 1 10 0A5 5 0 0 1 7 7m12.028 8.626c-.342-.061-.834.027-1.346.557a1 1 0 0 1-1.438 0c-.512-.53-1.003-.618-1.345-.557-.36.064-.681.312-.837.702-.257.643-.16 2.334 2.901 4.134 3.062-1.8 3.159-3.49 2.901-4.134a1.11 1.11 0 0 0-.836-.702m2.693-.041c.854 2.134-.456 4.844-4.284 6.904a1 1 0 0 1-.948 0c-3.828-2.06-5.137-4.77-4.284-6.904a3.11 3.11 0 0 1 2.343-1.929c.809-.144 1.655.035 2.415.536.76-.5 1.607-.68 2.415-.536a3.11 3.11 0 0 1 2.343 1.929m-11.795-1.38a1 1 0 0 1-.548 1.303C7.06 16.453 5.5 18.581 5.5 21a1 1 0 1 1-2 0c0-3.322 2.141-6.128 5.122-7.344a1 1 0 0 1 1.304.549"
        clipRule="evenodd"
      ></path>
    </svg>
  );
};

export default AppearanceIcon;
