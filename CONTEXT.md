# Domain language

- **Agent run envelope**: the versioned, JSON-safe request contract created after ingress authentication and protocol validation but before agent, provider, tool, or MCP initialization. It carries only the validated protocol payload and the minimum trusted principal identifiers. The execution host rehydrates all runtime state from those identifiers.
