import React, { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Transition } from 'react-transition-group';
import { Constants } from 'librechat-data-provider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';

interface AssistantConversationStartersProps {
  field: {
    value: string[];
    onChange: (value: string[]) => void;
  };
  inputClass: string;
  labelClass: string;
}

const AssistantConversationStarters: React.FC<AssistantConversationStartersProps> = ({
  field,
  inputClass,
  labelClass,
}) => {
  const localize = useLocalize();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nodeRef = useRef(null);
  const [newStarter, setNewStarter] = useState('');

  const handleAddStarter = () => {
    if (newStarter.trim() && field.value.length < Constants.MAX_CONVO_STARTERS) {
      const newValues = [newStarter, ...field.value];
      field.onChange(newValues);
      setNewStarter('');
    }
  };

  const handleDeleteStarter = (index: number) => {
    const newValues = field.value.filter((_, i) => i !== index);
    field.onChange(newValues);
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
          in={field.value.length < Constants.MAX_CONVO_STARTERS}
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
        <div className="relative">
          <input
            ref={(el) => (inputRefs.current[0] = el)}
            value={newStarter}
            maxLength={64}
            className={inputClass}
            type="text"
            placeholder={localize('com_assistants_conversation_starters_placeholder')}
            onChange={(e) => setNewStarter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddStarter();
              }
            }}
          />
        </div>
        {field.value.map((starter, index) => (
          <div key={index} className="relative">
            <input
              ref={(el) => (inputRefs.current[index + 1] = el)}
              value={starter}
              readOnly
              className={`${inputClass} pr-10`}
              type="text"
            />
            <TooltipProvider delayDuration={1000}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
                    onClick={() => handleDeleteStarter(index)}
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
