import React, { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { Transition } from 'react-transition-group';

interface AssistantConversationStartersProps {
  field: {
    value: string[];
    onChange: (value: string[]) => void;
  };
  inputClass: string;
  labelClass: string;
}

export const MAX_STARTERS = 4;

const AssistantConversationStarters: React.FC<AssistantConversationStartersProps> = ({
  field,
  inputClass,
  labelClass,
}) => {
  const localize = useLocalize();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nodeRef = useRef(null);

  const handleAddStarter = () => {
    const newValues = [...field.value];
    if (newValues.length < MAX_STARTERS) {
      newValues.unshift('');
      field.onChange(newValues);
    }
  };

  const defaultStyle = {
    transition: 'opacity 200ms ease-in-out',
    opacity: 0,
  };

  const transitionStyles = {
    entering: { opacity: 1 },
    entered: { opacity: 1 },
    exiting: { opacity: 0 },
    exited: { opacity: 0 },
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <label className={labelClass} htmlFor="conversation_starters">
          {localize('com_assistants_conversation_starters')}
        </label>
        <Transition
          nodeRef={nodeRef}
          in={field.value.length < MAX_STARTERS}
          timeout={200}
          unmountOnExit
        >
          {(state: string) => (
            <div
              ref={nodeRef}
              style={{
                ...defaultStyle,
                ...transitionStyles[state as keyof typeof transitionStyles],
                transition: state === 'entering' ? 'none' : defaultStyle.transition,
              }}
            >
              <TooltipProvider delayDuration={1000}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
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
        </Transition>
      </div>
      <div className="mt-4 space-y-2">
        {field.value.map((starter, index) => (
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
                field.onChange(newValues);
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
            <TooltipProvider delayDuration={1000}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
                    onClick={() => {
                      const newValues = field.value.filter((_, i) => i !== index);
                      field.onChange(newValues);
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default AssistantConversationStarters;
