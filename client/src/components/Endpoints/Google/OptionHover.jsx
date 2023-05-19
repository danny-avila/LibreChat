import React from 'react';
import { HoverCardPortal, HoverCardContent } from '~/components/ui/HoverCard.tsx';

const types = {
  temp: 'Higher values = more random, while lower values = more focused and deterministic. We recommend altering this or Top P but not both.',
  topp: 'Top-p changes how the model selects tokens for output. Tokens are selected from most K (see topK parameter) probable to least until the sum of their probabilities equals the top-p value.',
  topk: "Top-k changes how the model selects tokens for output. A top-k of 1 means the selected token is the most probable among all tokens in the model's vocabulary (also called greedy decoding), while a top-k of 3 means that the next token is selected from among the 3 most probable tokens (using temperature).",
  maxoutputtokens:
    ' 	Maximum number of tokens that can be generated in the response. Specify a lower value for shorter responses and a higher value for longer responses.'
};

function OptionHover({ type, side }) {
  // const options = {};
  // if (type === 'pres') {
  //   options.sideOffset = 45;
  // }

  return (
    <HoverCardPortal>
      <HoverCardContent
        side={side}
        className="w-80 "
        // {...options}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">{types[type]}</p>
        </div>
      </HoverCardContent>
    </HoverCardPortal>
  );
}

export default OptionHover;
