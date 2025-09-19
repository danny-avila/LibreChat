import { useMemo } from 'react';
import { AgentCapabilities } from 'librechat-data-provider';

interface AgentCapabilitiesResult {
  toolsEnabled: boolean;
  actionsEnabled: boolean;
  artifactsEnabled: boolean;
  ocrEnabled: boolean;
  contextEnabled: boolean;
  fileSearchEnabled: boolean;
  webSearchEnabled: boolean;
  codeEnabled: boolean;
}

export default function useAgentCapabilities(
  capabilities: AgentCapabilities[] | undefined,
): AgentCapabilitiesResult {
  const toolsEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.tools) ?? false,
    [capabilities],
  );

  const actionsEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.actions) ?? false,
    [capabilities],
  );

  const artifactsEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.artifacts) ?? false,
    [capabilities],
  );

  const ocrEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.ocr) ?? false,
    [capabilities],
  );

  const contextEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.context) ?? false,
    [capabilities],
  );

  const fileSearchEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.file_search) ?? false,
    [capabilities],
  );

  const webSearchEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.web_search) ?? false,
    [capabilities],
  );

  const codeEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.execute_code) ?? false,
    [capabilities],
  );

  return {
    ocrEnabled,
    codeEnabled,
    toolsEnabled,
    actionsEnabled,
    contextEnabled,
    artifactsEnabled,
    webSearchEnabled,
    fileSearchEnabled,
  };
}
