import { useEffect } from 'react';
import type { ActionItem } from '../../items/types';
import ActionEditor from '../../ActionEditor';
import { useAgentPanelContext } from '~/Providers';

/** Sentinel id the marketplace assigns to its create-action selection (cross-file contract). */
const NEW_ACTION_ID = '__new_action__';

interface Props {
  item: ActionItem;
  agentId: string;
  onClose: () => void;
}

export default function ActionSection({ item, agentId, onClose }: Props) {
  const { setAction } = useAgentPanelContext();
  const isCreate = item.id === NEW_ACTION_ID;

  useEffect(() => {
    setAction(isCreate ? undefined : item.action);
    return () => setAction(undefined);
  }, [isCreate, item.action, setAction]);

  return (
    <div className="flex flex-col gap-5">
      <ActionEditor
        agentId={agentId}
        onClose={onClose}
        onDeleted={onClose}
        onCreated={isCreate ? onClose : undefined}
      />
    </div>
  );
}
