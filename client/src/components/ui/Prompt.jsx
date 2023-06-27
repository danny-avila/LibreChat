import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '../../localization/Translation';

export default function Prompt({ title, prompt }) {
  const lang = useRecoilValue(store.lang);

  return (
    <div
      // onclick="selectPromptTemplate(0)"
      className="flex w-full flex-col gap-2 rounded-md bg-gray-50 p-4 text-left hover:bg-gray-200 dark:bg-white/5 "
    >
      <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
        {title}
      </h2>
      <button>
        <p className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900">
          {prompt}
        </p>
      </button>
      <span className="font-medium">{localize(lang, 'com_ui_use_prompt')} →</span>
    </div>
  );
}
