import { Tools } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useVerifyAgentToolAuth, useGetStartupConfig } from '~/data-provider';
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
  const { data: config } = useGetStartupConfig();
  const isPiston = config?.codeExecutor === 'piston';

  const title = isPiston
    ? localize('com_agents_code_execution_title')
    : localize('com_agents_code_interpreter_title');

  const subtitle = isPiston
    ? localize('com_agents_powered_by_piston')
    : localize('com_agents_by_librechat');

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex flex-row items-center gap-1">
          <div className="flex items-center gap-1">
            <span className="text-token-text-primary block font-medium">
              {title}
            </span>
            <span className="text-xs text-text-secondary">
              {subtitle}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Action authType={data?.message} isToolAuthenticated={data?.authenticated} />
        <Files agent_id={agent_id} files={files} />
      </div>
    </div>
  );
}
