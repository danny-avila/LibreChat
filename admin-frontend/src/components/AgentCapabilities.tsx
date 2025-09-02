import React from 'react';
import { AGENT_CAPABILITIES } from '../constants';

interface AgentCapability {
  id: string;
  label: string;
  description: string;
  icon: string;
}

interface AgentCapabilitiesProps {
  label: string;
  description: string;
  value: string[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
  capabilityType?: 'agent' | 'assistant';
}

export const AgentCapabilities: React.FC<AgentCapabilitiesProps> = ({
  label,
  description,
  value = [],
  disabled = false,
  onChange,
}) => {
  
  const handleToggle = (capabilityId: string) => {
    if (disabled) return;
    
    const newValue = value.includes(capabilityId)
      ? value.filter(id => id !== capabilityId)
      : [...value, capabilityId];
    
    onChange(newValue);
  };

  return (
    <div className="p-6 border-b border-gray-200 last:border-b-0">
      <div className="mb-4">
        <h3 className="text-base font-medium text-gray-900 mb-1">{label}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {AGENT_CAPABILITIES.map((capability: AgentCapability) => {
          const isSelected = value.includes(capability.id);
          
          return (
            <button
              key={capability.id}
              type="button"
              disabled={disabled}
              onClick={() => handleToggle(capability.id)}
              className={`
                relative p-4 rounded-lg border-2 text-left transition-all duration-200
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50 shadow-sm' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
                }
                ${disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer hover:shadow-sm'
                }
              `}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">{capability.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm text-gray-900 truncate">
                      {capability.label}
                    </h4>
                    {isSelected && (
                      <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {capability.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      
      {value.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-2">
            <strong>Selected capabilities ({value.length}):</strong>
          </p>
          <div className="flex flex-wrap gap-1">
            {value.map(capId => {
              const capability = AGENT_CAPABILITIES.find((c: AgentCapability) => c.id === capId);
              return capability ? (
                <span
                  key={capId}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md"
                >
                  <span>{capability.icon}</span>
                  <span>{capability.label}</span>
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}; 