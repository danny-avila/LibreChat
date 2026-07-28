import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Label,
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  InfoHoverCard,
  OGDialogTrigger,
  OGDialogContent,
} from '@librechat/client';
import CreateKeyDialog from './CreateKeyDialog';
import { useLocalize } from '~/hooks';
import Admin from './Admin';
import List from './List';

export default function ApiKeys() {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex items-center justify-between">
      <Label id="agent-api-keys-label">{localize('com_ui_agent_api_keys')}</Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-labelledby="agent-api-keys-label">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogContent
          className="w-11/12 max-w-2xl bg-background text-text-primary shadow-2xl"
          aria-describedby={undefined}
        >
          <OGDialogHeader className="space-y-0 pr-8 text-left">
            <div className="flex items-center gap-1.5">
              <OGDialogTitle>{localize('com_ui_agent_api_keys')}</OGDialogTitle>
              <InfoHoverCard text={localize('com_ui_api_keys_description')} />
            </div>
          </OGDialogHeader>
          <List onCreate={() => setCreateOpen(true)} />
          <div className="flex items-center gap-2">
            <Admin />
            <Button size="sm" className="ml-auto gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_create_api_key')}
            </Button>
          </div>
          <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
