import React from 'react';

/**
 * Component for displaying the Privacy Policy page
 * @returns Privacy Policy React component
 */
export default function Footer() {
  return (
    <>
      <div className="align-end m-4 flex justify-center gap-2 pb-4" role="contentinfo">
        <a className="text-sm text-green-500" href="/" target="_blank" rel="noreferrer">
          Home
        </a>
        <div className="border-r-[1px] border-gray-300 dark:border-gray-600"></div>
        <a
          className="text-sm text-green-500"
          href="/pages/privacy-policy"
          target="_blank"
          rel="noreferrer"
        >
          Privacy policy
        </a>
        <div className="border-r-[1px] border-gray-300 dark:border-gray-600"></div>
        <a className="text-sm text-green-500" href="/pages/tos" target="_blank" rel="noreferrer">
          Terms of service
        </a>
      </div>
    </>
  );
}
