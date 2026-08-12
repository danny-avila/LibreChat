# Domain language

- **Agent run envelope**: the versioned, JSON-safe request contract created after ingress authentication and protocol validation but before agent, provider, tool, or MCP initialization. It carries only the validated protocol payload and the minimum trusted principal identifiers. The execution host rehydrates all runtime state from those identifiers.
- **Theme definition**: a versioned, data-only description of LibreChat semantic colors and shared appearance roles, optionally specialized by light or dark mode. The theme module validates and resolves partial definitions against bundled defaults before adapters apply them. A theme definition does not contain arbitrary CSS, application behavior, or alternate feature layouts.
