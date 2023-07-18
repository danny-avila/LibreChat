import ChatIcon from '../svg/ChatIcon';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

export default function Templates({ showTemplates }) {
  const lang = useRecoilValue(store.lang);

  return (
    <div id="templates-wrapper" className="mt-6 flex items-start gap-3.5 text-center ">
      <div className="flex flex-1 flex-col gap-3.5">
        <ChatIcon />
        <h2 className="text-lg font-normal">{localize(lang, 'com_ui_prompt_templates')}</h2>
        <ul className="flex flex-col gap-3.5">
          <ul className="flex flex-col gap-3.5"></ul>

          <div className="flex flex-1 flex-col items-center gap-3.5">
            <span className="text-sm text-gray-700 dark:text-gray-400">
              {localize(lang, 'com_ui_showing')}{' '}
              <span className="font-semibold text-gray-900 dark:text-white">1</span>{' '}
              {localize(lang, 'com_ui_of')}{' '}
              <a id="prompt-link">
                <span className="font-semibold text-gray-900 dark:text-white">
                  1 {localize(lang, 'com_ui_entries')}
                </span>
              </a>
            </span>
            <button
              onClick={showTemplates}
              className="btn btn-neutral justify-center gap-2 border-0 md:border"
            >
              <ChatIcon />
              {localize(lang, 'com_ui_hide_prompt_templates')}
            </button>
            <div
              // onclick="selectPromptTemplate(0)"
              className="flex w-full flex-col gap-2 rounded-md bg-gray-50 p-4 text-left hover:bg-gray-200 dark:bg-white/5 "
            >
              <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
                {localize(lang, 'com_ui_dan')}
              </h2>
              <button>
                <p className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900">
                  {localize(lang, 'com_ui_dan_template')}
                </p>
              </button>
              <span className="font-medium">{localize(lang, 'com_ui_use_prompt')} →</span>
            </div>
            <div className="xs:mt-0 mt-2 inline-flex">
              <button
                // onclick="prevPromptTemplatesPage()"
                className="bg-gray-100 px-4  py-2 font-medium hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:text-white"
                style={{ borderRadius: '6px 0 0 6px' }}
              >
                {localize(lang, 'com_ui_prev')}
              </button>
              <button
                // onclick="nextPromptTemplatesPage()"
                className="border-0 border-l  border-gray-500 bg-gray-100 px-4 py-2 font-medium hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:text-white"
                style={{ borderRadius: '6px 0 0 6px' }}
              >
                {localize(lang, 'com_ui_next')}
              </button>
            </div>
          </div>
        </ul>
      </div>
    </div>
  );
}
