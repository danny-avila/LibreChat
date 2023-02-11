import React from 'react';
import RegenerateIcon from '../svg/RegenerateIcon';

export default function Regenerate({ submitMessage, tryAgain }) {
  const clickHandler = (e) => {
    e.preventDefault();
    submitMessage();
  };

  return (
    <>
      <span className="mb-2 block flex justify-center text-xs md:mb-2">
        There was an error generating a response
      </span>
      <span className="m-auto flex justify-center">
        <button
          onClick={clickHandler}
          className="btn btn-primary m-auto flex justify-center gap-2"
        >
          <RegenerateIcon />
          Regenerate response
        </button>
        <button onClick={tryAgain} className="btn btn-neutral flex justify-center gap-2 border-0 md:border">
          <RegenerateIcon />
          Try another message
        </button>
      </span>
    </>
  );
}
