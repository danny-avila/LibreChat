import { Plus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { useRef, useEffect } from 'react';

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
  const MAX_STARTERS = 4;
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleAddStarter = () => {
    const newValues = [...field.value];
    if (newValues.length < MAX_STARTERS) {
      newValues.unshift('');
      field.onChange(newValues);
    }
  };

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [field.value.length]);

  return (
    <div className="relative">
      <div className="mt-4 space-y-2">
        {Array.isArray(field.value) && field.value.length === 0 && (
          <div className="relative">
            <input
              ref={(el) => (inputRefs.current[0] = el)}
              value=""
              maxLength={64}
              className={inputClass}
              type="text"
              placeholder={localize('com_assistants_conversation_starters_placeholder')}
              onChange={(e) => {
                const newValues = [e.target.value];
                const filteredValues = newValues.filter((value) => value.trim() !== '');
                field.onChange(filteredValues);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddStarter();
                }
              }}
            />
            <TooltipProvider delayDuration={1000}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="transition-color absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg duration-200 hover:bg-surface-hover"
                    onClick={handleAddStarter}
                  >
                    <Plus className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={0}>
                  {localize('com_ui_add')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        {Array.isArray(field.value) &&
          field.value.map((starter, index) => (
            <div key={index} className="relative">
              <input
                ref={(el) => (inputRefs.current[index] = el)}
                value={starter}
                maxLength={64}
                className={inputClass}
                type="text"
                placeholder={localize('com_assistants_conversation_starters_placeholder')}
                onChange={(e) => {
                  const newValues = [...field.value];
                  newValues[index] = e.target.value;
                  const filteredValues = newValues.filter((value) => value.trim() !== '');
                  field.onChange(filteredValues);
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
                <TooltipProvider delayDuration={1000}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="transition-color absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg duration-200 hover:bg-surface-hover"
                        onClick={handleAddStarter}
                      >
                        <Plus className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={0}>
                      {localize('com_ui_add')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <TooltipProvider delayDuration={1000}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="transition-color absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg duration-200 hover:bg-surface-hover"
                        onClick={() => {
                          const newValues = field.value.filter((_, i) => i !== index);
                          const filteredValues = newValues.filter((value) => value.trim() !== '');
                          field.onChange(filteredValues);
                        }}
                      >
                        <X className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={0}>
                      {localize('com_ui_delete')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
