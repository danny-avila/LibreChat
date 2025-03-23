import React from 'react';
import {
  EModelEndpoint,
  TModelSpec,
  TInterfaceConfig,
  TAgentsMap,
  TAssistantsMap,
} from 'librechat-data-provider';

export interface Endpoint {
  value: string;
  label: string;
  hasModels: boolean;
  models?: string[];
  icon: React.ReactNode;
  agentNames?: Record<string, string>;
  assistantNames?: Record<string, string>;
  modelIcons?: Record<string, string | undefined>;
}

export interface SelectedValues {
  endpoint: string | null;
  model: string | null;
  modelSpec: string | null;
}

export interface ModelSelectorProps {
  interfaceConfig: TInterfaceConfig;
  modelSpecs: TModelSpec[];
}
