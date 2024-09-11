import { useMemo } from 'react';
// import { Capabilities } from 'librechat-data-provider';
import { useFormContext, useWatch } from 'react-hook-form';
import type { TConfig } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
// import ImageVision from './ImageVision';
import { useLocalize } from '~/hooks';
import Retrieval from './Retrieval';
import CodeFiles from './CodeFiles';
import Code from './Code';

export default function CapabilitiesForm({
  codeEnabled,
  retrievalEnabled,
  agentsConfig,
}: {
  codeEnabled?: boolean;
  retrievalEnabled?: boolean;
  agentsConfig?: TConfig | null;
}) {
  const localize = useLocalize();

  const methods = useFormContext<AgentForm>();
  const { control } = methods;
  const agent = useWatch({ control, name: 'agent' });
  const agent_id = useWatch({ control, name: 'id' });
  const files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }
    return agent?.code_files;
  }, [agent]);

  const retrievalModels = useMemo(
    () => new Set(agentsConfig?.retrievalModels ?? []),
    [agentsConfig],
  );
  // const imageVisionEnabled = useMemo(
  //   () => agentsConfig?.capabilities?.includes(Capabilities.image_vision),
  //   [agentsConfig],
  // );

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
        {codeEnabled && <Code />}
        {retrievalEnabled && <Retrieval retrievalModels={retrievalModels} />}
        {/* {imageVisionEnabled && version == 1 && <ImageVision />} */}
        {codeEnabled && <CodeFiles agent_id={agent_id} files={files} />}
      </div>
    </div>
  );
}
