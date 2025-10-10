# Honeycomb MCP Server Setup

This guide explains how to configure the Honeycomb MCP (Model Context Protocol) server for LibreChat, which provides access to the Hive RDF triple store API.

## Overview

The Honeycomb MCP server enables AI agents in LibreChat to interact with your Hive RDF triple store, allowing them to:
- Create new honeycombs (RDF graphs)
- Add entities to honeycombs
- Query and retrieve honeycomb data

## Prerequisites

1. **Hive API running**: Your Hive RDF triple store API must be accessible at `http://localhost:8000`
2. **Honeycomb MCP Server**: The `senticor-hive-mcp` project must be built and available at `/Users/wolfgang/workspace/senticor-hive-mcp`

## Configuration

### 1. librechat.yaml

The Honeycomb MCP server is configured in the `mcpServers` section:

```yaml
mcpServers:
  honeycomb:
    type: stdio
    command: node
    args:
      - /app/mcp-servers/honeycomb/dist/index.js
    timeout: 60000  # 1 minute timeout for RDF triple store queries
    chatMenu: true  # Enable in chat dropdown menu
    serverInstructions: true  # Enable dynamic server instructions
    env:
      HONEYCOMB_API_URL: "http://host.docker.internal:8000"
```

**Important**:
- The URL uses `host.docker.internal:8000` to access the host machine's localhost from within the Docker container
- If your Hive API runs on a different port, update the `HONEYCOMB_API_URL` accordingly

### 2. docker-compose.override.yml

The Honeycomb MCP server files are mounted into the container:

```yaml
services:
  api:
    volumes:
      # Mount MCP server for Honeycomb (Hive RDF Triple Store)
      - /Users/wolfgang/workspace/senticor-hive-mcp:/app/mcp-servers/honeycomb:ro
```

## Available Tools

The Honeycomb MCP server provides the following tools to AI agents:

### 1. `create_honeycomb`
Creates a new honeycomb (RDF graph) in the Hive triple store.

**Use case**: Initialize a new knowledge graph for a specific domain or project.

### 2. `add_entity_to_honeycomb`
Adds an entity (RDF triple) to an existing honeycomb.

**Use case**: Populate the knowledge graph with data, relationships, and semantic information.

### 3. `get_honeycomb`
Retrieves information from a honeycomb (queries the RDF graph).

**Use case**: Query and extract knowledge from the triple store.

## Usage

### In Regular Chat

1. Start a new chat in LibreChat
2. The Honeycomb tools are automatically available to the AI when needed
3. Ask the AI to interact with your Hive triple store:
   ```
   Create a new honeycomb for customer data
   ```
   ```
   Add an entity representing John Doe to the customer honeycomb
   ```
   ```
   Query the customer honeycomb for all entities
   ```

### With Agents

1. Create or edit an Agent in LibreChat
2. The Honeycomb tools are available for the agent to use
3. Configure your agent to work with RDF data:
   - Give it context about your triple store structure
   - Define specific tasks related to knowledge graph management

### In Chat Menu

Since `chatMenu: true` is enabled, you can also:
1. Click the chat menu (usually a plugin/tool icon)
2. Select "honeycomb" from available MCP servers
3. Interact directly with the Honeycomb API

## Troubleshooting

### Connection Errors

If the agent cannot connect to the Hive API:

1. **Check Hive API is running**:
   ```bash
   curl http://localhost:8000/health
   ```

2. **Verify the container can reach host**:
   ```bash
   podman exec LibreChat curl http://host.docker.internal:8000/health
   ```

3. **Check logs for errors**:
   ```bash
   podman logs LibreChat | grep -i honeycomb
   ```

### MCP Server Not Loading

If Honeycomb doesn't appear in the logs:

1. **Verify the MCP server is built**:
   ```bash
   ls -la /Users/wolfgang/workspace/senticor-hive-mcp/dist/index.js
   ```

2. **Check volume mount**:
   ```bash
   podman exec LibreChat ls -la /app/mcp-servers/honeycomb/dist/index.js
   ```

3. **Rebuild if necessary**:
   ```bash
   cd /Users/wolfgang/workspace/senticor-hive-mcp
   npm run build
   ```

4. **Restart LibreChat**:
   ```bash
   podman restart LibreChat
   ```

### Tool Not Working

If the Honeycomb tools don't work properly:

1. **Check the HONEYCOMB_API_URL is correct**:
   ```bash
   podman exec LibreChat printenv HONEYCOMB_API_URL
   ```

2. **Test the Hive API directly**:
   ```bash
   curl -X POST http://localhost:8000/api/create-honeycomb \
     -H "Content-Type: application/json" \
     -d '{"name": "test"}'
   ```

3. **Review MCP server logs**:
   ```bash
   podman logs LibreChat 2>&1 | grep -A 20 "honeycomb"
   ```

## Configuration Options

### Changing the Hive API URL

If your Hive API runs on a different host or port:

1. Edit [librechat.yaml](../../librechat.yaml#L186):
   ```yaml
   env:
     HONEYCOMB_API_URL: "http://your-host:your-port"
   ```

2. Restart LibreChat:
   ```bash
   podman restart LibreChat
   ```

### Adjusting Timeout

If triple store queries take longer than 1 minute:

1. Edit [librechat.yaml](../../librechat.yaml#L182):
   ```yaml
   timeout: 120000  # 2 minutes
   ```

2. Restart LibreChat

### Disabling Chat Menu

To hide Honeycomb from the chat menu:

1. Edit [librechat.yaml](../../librechat.yaml#L183):
   ```yaml
   chatMenu: false
   ```

2. Restart LibreChat

## Integration with StackIT Agents

For optimal performance when using Honeycomb with StackIT models:

1. Use **StackIT Agents** endpoint (supports tool calling)
2. Recommended models:
   - `cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic` - Best for complex RDF queries
   - `neuralmagic/Meta-Llama-3.1-8B-Instruct-FP8` - Faster for simple operations

Example agent configuration:
- **Provider**: StackIT Agents
- **Model**: cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic
- **Tools**: Honeycomb tools enabled
- **Instructions**: "You are a knowledge graph assistant with access to the Hive RDF triple store..."

## Development

### Updating the Honeycomb MCP Server

1. Make changes in the `senticor-hive-mcp` project
2. Rebuild:
   ```bash
   cd /Users/wolfgang/workspace/senticor-hive-mcp
   npm run build
   ```
3. Restart LibreChat:
   ```bash
   podman restart LibreChat
   ```

The changes will be immediately available since the directory is mounted as a volume.

### Adding New Tools

To add new tools to the Honeycomb MCP server:

1. Edit the MCP server code in `senticor-hive-mcp`
2. Define new tool schemas and handlers
3. Rebuild and restart (see above)
4. Test with an agent in LibreChat

## Related Documentation

- [MCP Server Setup for Rechtsinformationen](./HIVE-HONEYCOMB-MCP-SETUP.md) - Setup for the legal information MCP server
- [StackIT Setup](./STACKIT-SETUP.md) - Using StackIT models with agents and MCP tools
- [LibreChat MCP Documentation](https://www.librechat.ai/docs/configuration/librechat_yaml/mcp)

## Support

For issues specific to:
- **Honeycomb MCP Server**: Check the `senticor-hive-mcp` repository
- **Hive API**: Check your Hive triple store documentation
- **LibreChat Integration**: Check the [LibreChat GitHub](https://github.com/danny-avila/LibreChat)
