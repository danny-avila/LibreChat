import { HoverCardPortal, HoverCardContent } from '~/components';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const types = {
  temp: 'com_endpoint_openai_temp',
  func: 'com_endpoint_func_hover',
  skip: 'com_endpoint_skip_hover',
  max: 'com_endpoint_openai_max',
  topp: 'com_endpoint_openai_topp',
  freq: 'com_endpoint_openai_freq',
  pres: 'com_endpoint_openai_pres',
};

function OptionHover({ type, side }) {
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
