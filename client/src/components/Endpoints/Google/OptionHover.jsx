import React from 'react';
import { HoverCardPortal, HoverCardContent } from '~/components/ui/HoverCard.tsx';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const types = {
  temp: 'com_endpoint_google_temp',
  topp: 'com_endpoint_google_topp',
  topk: 'com_endpoint_google_topk',
  maxoutputtokens: 'com_endpoint_google_maxoutputtokens',
};

function OptionHover({ type, side }) {
  // const options = {};
  // if (type === 'pres') {
  //   options.sideOffset = 45;
  // }
  const lang = useRecoilValue(store.lang);

  return (
    <HoverCardPortal>
      <HoverCardContent
        side={side}
        className="w-80 "
        // {...options}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">{localize(lang, types[type])}</p>
        </div>
      </HoverCardContent>
    </HoverCardPortal>
  );
}

export default OptionHover;
