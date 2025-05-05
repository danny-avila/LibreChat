import { Tools } from 'librechat-data-provider';
import { useVerifyAgentToolAuth } from '~/data-provider';
import { useLocalize } from '~/hooks';
import Action from './Action';

export default function SearchForm() {
  const localize = useLocalize();
  const { data } = useVerifyAgentToolAuth(
    { toolId: Tools.web_search },
    {
      // WIP, for testing purposes
      // enabled: true
      enabled: false,
    },
  );

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex flex-row items-center gap-1">
          <div className="flex items-center gap-1">
            <span className="text-token-text-primary block font-medium">
              {localize('com_ui_web_search')}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Action
          authType={data?.message}
          // isToolAuthenticated={data?.authenticated}
          // WIP, for testing purposes
          isToolAuthenticated={true}
        />
      </div>
    </div>
  );
}
