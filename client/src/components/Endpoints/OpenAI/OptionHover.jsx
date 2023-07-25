import React from 'react';
import { HoverCardPortal, HoverCardContent } from '~/components/ui/HoverCard.tsx';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const types = {
  temp: 'com_endpoint_openai_temp',
  max: 'com_endpoint_openai_max',
  topp: 'com_endpoint_openai_topp',
  freq: 'com_endpoint_openai_freq',
  pres: 'com_endpoint_openai_pres',
};

function OptionHover({ type, side }) {
  const lang = useRecoilValue(store.lang);

  return (
    <HoverCardPortal>
      <HoverCardContent side={side} className="w-80 ">
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">{localize(lang, types[type])}</p>
        </div>
      </HoverCardContent>
    </HoverCardPortal>
  );
}

export default OptionHover;
