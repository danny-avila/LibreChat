import React from 'react';

export default function Regenerate({ submitMessage }) {
  const clickHandler = (e) => {
    e.preventDefault();
    submitMessage();
  };

  return (
    <>
      <span className="mb-auto block flex justify-center text-xs md:mb-auto">
        There was an error generating a response
      </span>
      <button
        onClick={clickHandler}
        className="btn btn-primary m-auto flex justify-center gap-2"
      >
        <svg
          stroke="currentColor"
          fill="none"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="1 4 1 10 7 10" />
          <polyline points="23 20 23 14 17 14" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
        Regenerate response
      </button>
    </>
  );
}
