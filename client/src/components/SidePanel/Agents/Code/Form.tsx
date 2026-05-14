import type { ExtendedFile } from '~/common';
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

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-token-text-primary block text-sm font-medium">
          {localize('com_ui_run_code')}
        </span>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Action />
        <Files agent_id={agent_id} files={files} />
      </div>
    </div>
  );
}
