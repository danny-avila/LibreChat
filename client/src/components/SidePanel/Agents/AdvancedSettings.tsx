import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@radix-ui/react-collapsible';
import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import SequentialAgents from './Sequential/SequentialAgents';
import { useLocalize } from '~/hooks';

export default function AdvancedSettings() {
  const [open, setOpen] = useState(false);
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control } = methods;

  return (
    <Collapsible
      className="mb-4 w-full"
      open={open}
      onOpenChange={setOpen}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="font-medium text-token-text-primary">
          {localize('com_ui_advanced')}
        </span>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-center h-6 w-6 rounded-full hover:bg-surface-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary border border-token-border-medium">
            {open ?
              <X className="h-3.5 w-3.5 text-token-text-secondary" /> :
              <ChevronDown className="h-3.5 w-3.5 text-token-text-secondary" />
            }
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent
        className={`overflow-hidden ${open ? 'animate-slideDownAndFade' : 'animate-slideUpAndFade'}`}
      >
        <div className="p-3 rounded-lg border border-token-border-medium mb-4 space-y-3">
          <Controller
            name="agent_ids"
            control={control}
            defaultValue={[]}
            render={({ field }) => <SequentialAgents field={field} />}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}