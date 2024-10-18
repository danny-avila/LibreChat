import type { ExtendedFile } from '~/common';
import { useLocalize } from '~/hooks';
import CodeFiles from './CodeFiles';
import Code from './Code';

export default function CodeForm({
  agent_id,
  files,
}: {
  agent_id: string;
  files?: [string, ExtendedFile][];
}) {
  const localize = useLocalize();

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
        <Code />
        <CodeFiles agent_id={agent_id} files={files} />
      </div>
    </div>
  );
}
