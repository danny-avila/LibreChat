import { Tools } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useVerifyAgentToolAuth } from '~/data-provider';
import { useLocalize } from '~/hooks';
import Action from './Action';
import Files from './Files';

export default function CodeForm({
  agent_id,
  files,
}: {
  agent_id: string;
  files?: [string, ExtendedFile][];
}) {
  const localize = useLocalize();
  const { data } = useVerifyAgentToolAuth({ toolId: Tools.execute_code });

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center">
        <span>
          <label className="text-token-text-primary block font-medium">
            {localize('com_assistants_capabilities')}
          </label>
        </span>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Action authType={data?.message} isToolAuthenticated={data?.authenticated} />
        <Files agent_id={agent_id} files={files} />
      </div>
    </div>
  );
}
