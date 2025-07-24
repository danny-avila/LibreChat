import type { AgentState, VersionRecord } from './types';

export const isActiveVersion = (
  version: VersionRecord,
  currentAgent: AgentState,
  versions: VersionRecord[],
): boolean => {
  if (!versions || versions.length === 0) {
    return false;
  }

  if (!currentAgent) {
    const versionIndex = versions.findIndex(
      (v) =>
        v.name === version.name &&
        v.instructions === version.instructions &&
        v.artifacts === version.artifacts,
    );
    return versionIndex === 0;
  }

  const matchesName = version.name === currentAgent.name;
  const matchesDescription = version.description === currentAgent.description;
  const matchesInstructions = version.instructions === currentAgent.instructions;
  const matchesArtifacts = version.artifacts === currentAgent.artifacts;

  const toolsMatch = () => {
    if (!version.tools && !currentAgent.tools) return true;
    if (!version.tools || !currentAgent.tools) return false;
    if (version.tools.length !== currentAgent.tools.length) return false;

    const sortedVersionTools = [...version.tools].sort();
    const sortedCurrentTools = [...currentAgent.tools].sort();

    return sortedVersionTools.every((tool, i) => tool === sortedCurrentTools[i]);
  };

  const capabilitiesMatch = () => {
    if (!version.capabilities && !currentAgent.capabilities) return true;
    if (!version.capabilities || !currentAgent.capabilities) return false;
    if (version.capabilities.length !== currentAgent.capabilities.length) return false;

    const sortedVersionCapabilities = [...version.capabilities].sort();
    const sortedCurrentCapabilities = [...currentAgent.capabilities].sort();

    return sortedVersionCapabilities.every(
      (capability, i) => capability === sortedCurrentCapabilities[i],
    );
  };

  return (
    matchesName &&
    matchesDescription &&
    matchesInstructions &&
    matchesArtifacts &&
    toolsMatch() &&
    capabilitiesMatch()
  );
};
