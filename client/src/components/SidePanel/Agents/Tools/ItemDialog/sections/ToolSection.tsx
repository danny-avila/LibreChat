import { useState } from 'react';
import type { ToolItem } from '../../items/types';
import PluginAuthForm from '~/components/Plugins/Store/PluginAuthForm';
import { pluginNeedsAuth } from '../../items/auth';
import { useLocalize } from '~/hooks';

interface Props {
  item: ToolItem;
}

export default function ToolSection({ item }: Props) {
  const localize = useLocalize();
  const [authDone, setAuthDone] = useState(false);
  const needsAuth = pluginNeedsAuth(item.plugin) && !authDone;

  return (
    <div className="flex flex-col gap-5">
      {item.description ? (
        <p className="text-sm leading-relaxed text-text-secondary">{item.description}</p>
      ) : (
        <p className="text-sm italic text-text-tertiary">
          {localize('com_ui_tools_no_description')}
        </p>
      )}
      {needsAuth && (
        <PluginAuthForm plugin={item.plugin} isEntityTool onSubmit={() => setAuthDone(true)} />
      )}
    </div>
  );
}
