import React from 'react';

/**
 * Component for displaying the Privacy Policy page
 * @returns Privacy Policy React component
 */
export default function Footer() {
  return (
    <>
      <div className="align-end m-4 flex justify-center gap-2 pb-4" role="contentinfo">
        <a className="text-sm text-blue-500" href="/" rel="noreferrer">
          Home
        </a>
        <div className="border-r-[1px] border-gray-300 dark:border-gray-600"></div>
        <a className="text-sm text-blue-500" href="/pages/privacy-policy" rel="noreferrer">
          Privacy policy
        </a>
        <div className="border-r-[1px] border-gray-300 dark:border-gray-600"></div>
        <a className="text-sm text-blue-500" href="/pages/tos" rel="noreferrer">
          Terms of service
        </a>
      </div>
    </>
  );
}
