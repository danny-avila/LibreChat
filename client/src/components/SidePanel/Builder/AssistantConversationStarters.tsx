import { Plus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';

interface AssistantConversationStartersProps {
  field: {
    value: string[];
    onChange: (value: string[]) => void;
  };
  inputClass: string;
}

export default function AssistantConversationStarters({
  field,
  inputClass,
}: AssistantConversationStartersProps) {
  const localize = useLocalize();
  const MAX_STARTERS = 3;

  const handleAddStarter = () => {
    const newValues = [...field.value];
    if (newValues.length < MAX_STARTERS && newValues[0].trim() !== '') {
      newValues.unshift('');
      field.onChange(newValues);
      const filteredValues = newValues.filter((value) => value.trim() !== '');
      console.log('Added new conversation starter:', filteredValues);
    }
  };

  return (
    <div className="relative">
      <div className="mt-4 space-y-2">
        {Array.isArray(field.value) &&
          field.value.map((starter, index) => (
            <div key={index} className="relative">
              <input
                value={starter}
                maxLength={64}
                className={inputClass}
                type="text"
                placeholder={localize('com_assistants_conversation_starters_placeholder')}
                onChange={(e) => {
                  const newValues = [...field.value];
                  newValues[index] = e.target.value;
                  field.onChange(newValues);
                  console.log('Updated conversation starters:', newValues);
                }}
                onKeyDown={(e) => {
                  if (index === 0 && e.key === 'Enter') {
                    e.preventDefault();
                    handleAddStarter();
                  } else if (e.key === 'Backspace' && starter.trim() === '') {
                    e.preventDefault();
                  }
                }}
              />
              {index === 0 && field.value.length < MAX_STARTERS ? (
                <button
                  type="button"
                  className="transition-color absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg duration-200 hover:bg-surface-hover"
                  onClick={handleAddStarter}
                >
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Plus className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={0}>
                        {localize('com_ui_add')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </button>
              ) : (
                <button
                  type="button"
                  className="transition-color absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg duration-200 hover:bg-surface-hover"
                  onClick={() => {
                    const newValues = field.value.filter((_, i) => i !== index);
                    field.onChange(newValues);
                    console.log('Removed conversation starter:', newValues);
                  }}
                >
                  <TooltipProvider delayDuration={1000}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <X className="icon-sm" />
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={0}>
                        {localize('com_ui_delete')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
