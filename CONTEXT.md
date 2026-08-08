# Domain language

- **Agent run envelope**: the versioned, JSON-safe request contract created after ingress authentication and protocol validation but before agent, provider, tool, or MCP initialization. It carries only the validated protocol payload and the minimum trusted principal identifiers. The execution host rehydrates all runtime state from those identifiers.
- **MCP authority consistency**: the Mongo-wire Module that makes every MCP authority proof observe one stable authority generation. It owns proof reads, generation assertions, authority mutations, and fail-closed recovery behind one Interface.
- **MCP authority fence**: the single global Mongo document that serializes authority mutations. A clean fence names the current generation; a dirty fence names the mutation owner and makes all authority-dependent MCP work unavailable.
- **MCP authority mutation**: any change that can alter an MCP authorization decision, including principal, role, group, configuration, server, agent, ACL, credential, or OAuth state. Every such mutation must be executed by MCP authority consistency.
- **MCP authority proof**: a bounded, immutable authorization claim tied to one clean authority generation. The proof is usable only while that generation remains current and its time-dependent grants remain active.
- **MCP unavailable state**: the stable fail-closed result returned while the authority fence is dirty, consistency prerequisites are unmet, or reconciliation is required. General LibreChat operation remains available.
