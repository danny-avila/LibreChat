import React from 'react';
import { HoverCardPortal, HoverCardContent } from '~/components/ui/HoverCard.tsx';

const types = {
  temp: 'Higher values = more random, while lower values = more focused and deterministic. We recommend altering this or Top P but not both.',
  max: "The max tokens to generate. The total length of input tokens and generated tokens is limited by the model's context length.",
  'top-p':
    'An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered. We recommend altering this or temperature but not both.',
  freq: "Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.",
  pres: "Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics."
};

function OptionHover({ type, side }) {
  const options = {};

  if (type === 'pres') {
    options.sideOffset = 45;
  }

  return (
    <HoverCardPortal>
      <HoverCardContent
        side={side}
        className="w-52 "
        {...options}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">{types[type]}</p>
        </div>
      </HoverCardContent>
    </HoverCardPortal>
  );
}

export default OptionHover;
