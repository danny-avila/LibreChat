import React from 'react';
import { HoverCardPortal, HoverCardContent } from '~/components/ui';
import { OptionHoverProps } from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const types = {
  temp: 'com_endpoint_google_temp',
  topp: 'com_endpoint_google_topp',
  topk: 'com_endpoint_google_topk',
  maxoutputtokens: 'com_endpoint_google_maxoutputtokens',
};

function OptionHover({ type, side }: OptionHoverProps) {
  const lang = useRecoilValue(store.lang);

  return (
    <HoverCardPortal>
      <HoverCardContent side={side} className="w-80">
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">{localize(lang, types[type])}</p>
        </div>
      </HoverCardContent>
    </HoverCardPortal>
  );
}

export default OptionHover;
