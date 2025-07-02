# YAML Agent Configuration

This document describes the YAML agent configuration feature that allows you to define agents directly in your `librechat.yaml` configuration file.

## Overview

YAML agent configuration enables you to:
- Define agents as code in your configuration file
- Version control your agent configurations
- Deploy consistent agent configurations across environments
- Create read-only system agents that appear in the UI but cannot be modified

## Basic Usage

Add an `agents` section to your `librechat.yaml` file:

```yaml
# librechat.yaml
version: 1.2.1
cache: true

# ... other configuration ...

agents:
  definitions:
    - id: "research-assistant"
      name: "Research Assistant"
      description: "A specialized agent for research and information gathering"
      instructions: "You are a research assistant that helps users find and analyze information. Always provide sources and verify facts."
      provider: "openAI"
      model: "gpt-4o"
      tools: ["web_search", "file_search"]
      conversation_starters:
        - "Help me research a topic"
        - "Find information about..."
        - "Analyze this document"
      model_parameters:
        temperature: 0.3
        max_tokens: 2000
```

## Configuration Schema

### Required Fields

- `id` (string): Unique identifier for the agent
- `provider` (string): AI provider (e.g., "openAI", "anthropic", "bedrock")
- `model` (string): Model name (e.g., "gpt-4o", "claude-3-sonnet")

### Optional Fields

- `name` (string): Display name for the agent
- `description` (string): Brief description of the agent's purpose
- `instructions` (string): System prompt/instructions for the agent
- `avatar` (object): Avatar configuration with `filepath` and `source`
- `tools` (array): List of available tools (e.g., ["web_search", "execute_code"])
- `conversation_starters` (array): Pre-defined conversation starters
- `model_parameters` (object): Model-specific parameters
- `actions` (array): Custom actions available to the agent
- `tool_kwargs` (array): Tool-specific arguments
- `recursion_limit` (number): Maximum recursion depth for agent chains
- `hide_sequential_outputs` (boolean): Hide intermediate outputs
- `end_after_tools` (boolean): End conversation after tool use
- `agent_ids` (array): Other agents this agent can reference

## Complete Example

```yaml
agents:
  definitions:
    # Research Assistant Agent
    - id: "research-assistant"
      name: "Research Assistant"
      description: "Specialized in research and information gathering"
      instructions: |
        You are a research assistant that helps users find and analyze information.
        Always provide credible sources and verify facts before presenting them.
        Break down complex topics into digestible parts.
      provider: "openAI"
      model: "gpt-4o"
      tools: 
        - "web_search"
        - "file_search"
      conversation_starters:
        - "Help me research a topic"
        - "Find academic papers about..."
        - "Analyze this document for key insights"
      model_parameters:
        temperature: 0.3
        max_tokens: 2000
        top_p: 0.9
      avatar:
        filepath: "/assets/research-icon.svg"
        source: "local"

    # Code Review Agent
    - id: "code-reviewer"
      name: "Code Reviewer"
      description: "Expert code reviewer and analyzer"
      instructions: |
        You are a senior code reviewer that provides constructive feedback.
        Focus on code quality, security, performance, and best practices.
        Suggest specific improvements with examples.
      provider: "anthropic"
      model: "claude-3-sonnet"
      tools: 
        - "execute_code"
      conversation_starters:
        - "Review my code"
        - "Check for security vulnerabilities"
        - "Optimize this algorithm"
      model_parameters:
        temperature: 0.2
        max_tokens: 3000
      recursion_limit: 10

    # Multi-Agent Coordinator
    - id: "project-coordinator"
      name: "Project Coordinator"
      description: "Coordinates with other agents for complex tasks"
      instructions: |
        You coordinate complex projects by delegating to specialized agents.
        Break down tasks and assign them to appropriate agents.
      provider: "openAI"
      model: "gpt-4o"
      agent_ids:
        - "research-assistant"
        - "code-reviewer"
      tools:
        - "web_search"
        - "file_search"
      conversation_starters:
        - "Plan a complex project"
        - "Coordinate a multi-step task"
      model_parameters:
        temperature: 0.5
        max_tokens: 2500
```

## Key Features

### 1. Infrastructure as Code
- Version control your agent configurations
- Deploy consistent agents across environments
- Easy rollback and change management

### 2. Read-Only Agents
- YAML agents appear in the UI but cannot be edited
- Prevents accidental modifications to system agents
- Maintains configuration consistency

### 3. Hybrid System
- YAML agents work alongside database agents
- Users can still create personal agents through the UI
- YAML agents appear first in agent listings

### 4. Full Feature Support
- Supports all existing agent features
- Tools, actions, model parameters
- Agent chaining and collaboration
- Conversation starters and avatars

## Best Practices

### 1. Agent Naming
- Use descriptive, kebab-case IDs: `research-assistant`
- Provide clear names and descriptions
- Use consistent naming conventions

### 2. Instructions
- Write clear, specific instructions
- Use multi-line YAML strings for longer instructions
- Include examples when helpful

### 3. Model Selection
- Choose appropriate models for each agent's purpose
- Consider cost vs. capability trade-offs
- Test with different models to find optimal performance

### 4. Tool Configuration
- Only include tools the agent actually needs
- Be specific about tool permissions
- Consider security implications

## Migration from Database Agents

To convert existing database agents to YAML configuration:

1. Export agent configuration from the database
2. Transform to YAML format following the schema
3. Add to your `librechat.yaml` file
4. Test the agent functionality
5. Remove the database agent if desired

## Troubleshooting

### Configuration Not Loading
- Check YAML syntax is valid
- Verify the `agents` section is at the root level
- Ensure the configuration cache is enabled

### Agent Not Appearing
- Confirm the agent ID is unique
- Check that required fields are present
- Verify the configuration passed validation

### Tools Not Working
- Ensure tools are properly installed and configured
- Check tool permissions and availability
- Verify tool names match exactly

## Environment Variables

YAML agents support environment variable substitution:

```yaml
agents:
  definitions:
    - id: "custom-agent"
      name: "${AGENT_NAME}"
      provider: "${AI_PROVIDER}"
      model: "${AI_MODEL}"
```

## Security Considerations

- YAML agents are read-only in the UI
- Tool permissions should be carefully managed
- Sensitive instructions should not be exposed
- Consider using environment variables for API keys

## API Integration

YAML agents integrate seamlessly with the existing agent API:
- `/api/agents` - Lists both YAML and database agents
- `/api/agents/:id` - Retrieves YAML or database agents
- Agent initialization works identically for both types

## Future Enhancements

Planned features for YAML agent configuration:
- Hot reloading of configuration changes
- Agent templates and inheritance
- Conditional configuration based on environment
- Advanced validation and linting tools