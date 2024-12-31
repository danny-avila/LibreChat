import { Plus, X } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Transition } from 'react-transition-group';
import { Constants } from 'librechat-data-provider';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';
import { TooltipAnchor } from '~/components/ui';
import HideSequential from './HideSequential';

interface SequentialAgentsProps {
  field: {
    value: string[];
    onChange: (value: string[]) => void;
  };
}

const labelClass = 'mb-2 text-token-text-primary block font-medium';
const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 dark:border-gray-800 dark:bg-gray-800 rounded-xl mb-2',
  removeFocusOutlines,
);

const maxAgents = 5;

const SequentialAgents: React.FC<SequentialAgentsProps> = ({ field }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nodeRef = useRef(null);
  const [newAgentId, setNewAgentId] = useState('');

  const handleAddAgentId = () => {
    if (newAgentId.trim() && field.value.length < maxAgents) {
      const newValues = [...field.value, newAgentId];
      field.onChange(newValues);
      setNewAgentId('');
    }
  };

  const handleDeleteAgentId = (index: number) => {
    const newValues = field.value.filter((_, i) => i !== index);
    field.onChange(newValues);
  };

  const defaultStyle = {
    transition: 'opacity 200ms ease-in-out',
    opacity: 0,
  };

  const triggerShake = (element: HTMLElement) => {
    element.classList.remove('shake');
    void element.offsetWidth;
    element.classList.add('shake');
    setTimeout(() => {
      element.classList.remove('shake');
    }, 200);
  };

  const transitionStyles = {
    entering: { opacity: 1 },
    entered: { opacity: 1 },
    exiting: { opacity: 0 },
    exited: { opacity: 0 },
  };

  const hasReachedMax = field.value.length >= Constants.MAX_CONVO_STARTERS;

  return (
    <div className="relative">
      <label className={labelClass} htmlFor="agent_ids">
        Sequential Agents
      </label>
      <div className="mt-4 space-y-2">
        <HideSequential />
        {/* Display existing agents first */}
        {field.value.map((agentId, index) => (
          <div key={index} className="relative">
            <input
              ref={(el) => (inputRefs.current[index] = el)}
              value={agentId}
              onChange={(e) => {
                const newValue = [...field.value];
                newValue[index] = e.target.value;
                field.onChange(newValue);
              }}
              className={`${inputClass} pr-10`}
              type="text"
              maxLength={64}
            />
            <TooltipAnchor
              side="top"
              description={'Remove agent ID'}
              className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
              onClick={() => handleDeleteAgentId(index)}
            >
              <X className="size-4" />
            </TooltipAnchor>
          </div>
        ))}
        {/* Input for new agent at the bottom */}
        <div className="relative">
          <input
            ref={(el) => (inputRefs.current[field.value.length] = el)}
            value={newAgentId}
            maxLength={64}
            className={`${inputClass} pr-10`}
            type="text"
            placeholder={hasReachedMax ? 'Max agents reached' : 'Enter agent ID (e.g. agent_1234)'}
            onChange={(e) => setNewAgentId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (hasReachedMax) {
                  triggerShake(e.currentTarget);
                } else {
                  handleAddAgentId();
                }
              }
            }}
          />
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
                className="absolute right-1 top-1"
              >
                <TooltipAnchor
                  side="top"
                  description={hasReachedMax ? 'Max agents reached' : 'Add agent ID'}
                  className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
                  onClick={handleAddAgentId}
                  disabled={hasReachedMax}
                >
                  <Plus className="size-4" />
                </TooltipAnchor>
              </div>
            )}
          </Transition>
        </div>
      </div>
    </div>
  );
};

export default SequentialAgents;
