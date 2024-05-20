import { useMemo } from 'react';
import { Capabilities } from 'librechat-data-provider';
import type { TConfig, AssistantsEndpoint } from 'librechat-data-provider';
import ImageVision from './ImageVision';
import { useLocalize } from '~/hooks';
import Retrieval from './Retrieval';
import Code from './Code';

export default function CapabilitiesForm({
  version,
  endpoint,
  codeEnabled,
  retrievalEnabled,
  assistantsConfig,
}: {
  version: number | string;
  codeEnabled?: boolean;
  retrievalEnabled?: boolean;
  endpoint: AssistantsEndpoint;
  assistantsConfig?: TConfig | null;
}) {
  const localize = useLocalize();

  const retrievalModels = useMemo(
    () => new Set(assistantsConfig?.retrievalModels ?? []),
    [assistantsConfig],
  );
  const imageVisionEnabled = useMemo(
    () => assistantsConfig?.capabilities?.includes(Capabilities.image_vision),
    [assistantsConfig],
  );

  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-center">
        <span>
          <label className="text-token-text-primary block font-medium">
            {localize('com_assistants_capabilities')}
          </label>
        </span>
      </div>
      <div className="flex flex-col items-start gap-2">
        {codeEnabled && <Code endpoint={endpoint} version={version} />}
        {imageVisionEnabled && version == 1 && <ImageVision />}
        {retrievalEnabled && (
          <Retrieval endpoint={endpoint} version={version} retrievalModels={retrievalModels} />
        )}
      </div>
    </div>
  );
}
