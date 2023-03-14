import React from 'react';
import RegenerateIcon from '../svg/RegenerateIcon';

export default function Regenerate({ submitMessage, tryAgain, errorMessage }) {
  const clickHandler = (e) => {
    e.preventDefault();
    submitMessage();
  };

  return (
    <>
      <span className="mb-2 block flex justify-center text-xs text-black dark:text-white/50 md:mb-2">
        Une erreur s'est produite lors de la génération de la réponse
      </span>
      <span className="m-auto flex justify-center">
        {!errorMessage.includes('short') && (
          <button
            onClick={clickHandler}
            className="btn btn-primary m-auto flex justify-center gap-2"
          >
            <RegenerateIcon />
            Regenerate response
          </button>
        )}
        <button
          onClick={tryAgain}
          className="btn btn-neutral flex justify-center gap-2 border-0 md:border"
        >
          <RegenerateIcon />
          Try another message
        </button>
      </span>
    </>
  );
}
