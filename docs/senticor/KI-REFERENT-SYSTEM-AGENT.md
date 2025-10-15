# KI-Referent System Agent

## Overview

The KI-Referent agent is now available as a **system-wide agent** that all users can access. This eliminates the need for each user to configure custom instructions individually.

## What Changed

### Before (Per-User Configuration)
- Each user had to manually configure custom instructions
- Instructions were stored per-user in LibreChat UI settings
- Inconsistent experience across users
- Hard to maintain and update

### After (System Agent)
- **Single system-wide agent** accessible to all users
- **Public permissions** - visible to everyone
- **Centrally maintained** - update once, applies to all
- **Consistent experience** across all users

## Agent Configuration

### Basic Info
- **Agent ID**: `agent_ki_referent_system`
- **Name**: KI-Referent
- **Provider**: Anthropic
- **Model**: claude-3-5-sonnet-20241022
- **Category**: productivity

### Tools
The agent has access to:
- **Honeycomb MCP tools**:
  - `create_honeycomb` - Create new knowledge graphs
  - `list_honeycombs` - List existing knowledge graphs
  - `get_honeycomb` - Get details of a knowledge graph
  - `delete_honeycomb` - Delete a knowledge graph
  - `batch_add_entities` - Add entities to knowledge graph
  - `search_entities` - Search within knowledge graph
  - `get_entity` - Get specific entity
  - `delete_entity` - Delete entity
  - `get_honeycomb_stats` - Get statistics

- **Legal research MCP tool**:
  - `deutsche_gesetze_suchen` - Search German laws

- **Web search**:
  - `web_search` - Search the internet

### Behavior
The agent intelligently:
1. Analyzes every request for complexity signals
2. Automatically recognizes when knowledge graphs (Honeycombs) would be helpful
3. Proactively suggests creating Honeycombs for:
   - Projects (with location, time frame, multiple aspects)
   - Reports (integration reports, analysis documents)
   - Research (legal research, multi-source information)
   - Documentation (tracking multiple entities/relationships)

4. **Does NOT suggest Honeycombs for**:
   - Simple questions ("Was bedeutet...")
   - Single definitions
   - Basic legal lookups

5. **Waits for user approval** before creating Honeycombs
6. Uses German for all internal reasoning
7. Follows naming conventions for Honeycomb IDs

## How to Use

### For Users

1. **Access the agent**:
   - Open LibreChat
   - Click the model selector (shows current model like "gpt-5")
   - Select **"My Agents"**
   - Choose **"KI-Referent"**

2. **Start chatting**:
   - The agent will automatically detect when Honeycombs are useful
   - It will proactively suggest creating them
   - You decide yes/no

### For Administrators

#### Creating/Updating the Agent

```bash
# Inside LibreChat container
npm run create-ki-referent

# Or directly
node config/create-ki-referent-agent.js

# Options:
npm run create-ki-referent:dry-run  # Test without creating
npm run create-ki-referent:force     # Recreate if exists
```

#### From outside the container:
```bash
podman exec LibreChat npm run create-ki-referent
```

## Technical Details

### Permissions Model

The agent uses **LibreChat's ACL system**:
- **Author**: Admin user (required by schema)
- **Principal**: `PrincipalType.PUBLIC`
- **Access**: `AGENT_VIEWER` (read/use permissions)
- **Result**: All users can see and use the agent

### Database Storage

The agent is stored in the `agents` collection with:
- Fixed ID: `agent_ki_referent_system`
- Version history in `versions` array
- ACL entry in `aclentries` collection with PUBLIC principal

### Script Location

- **Script**: `/config/create-ki-referent-agent.js`
- **NPM commands**: Added to `package.json` scripts section

## Maintenance

### Updating Instructions

To update the agent's instructions:

1. Edit `/config/create-ki-referent-agent.js`
2. Modify the `instructions` field in `agentConfig`
3. Run with `--force` to recreate:
   ```bash
   podman exec LibreChat npm run create-ki-referent:force
   ```

### Updating Tools

To add/remove tools:

1. Edit the `tools` array in `agentConfig`
2. Run with `--force` to recreate
3. Ensure MCP servers are configured in `librechat.yaml`

### Verifying Agent

Check if agent exists and is public:

```bash
podman exec LibreChat node -e "
require('./config/connect')().then(async () => {
  const { Agent } = require('./api/db/models');
  const agent = await Agent.findOne({ id: 'agent_ki_referent_system' });
  console.log('Agent found:', !!agent);
  console.log('Name:', agent?.name);
  console.log('Tools:', agent?.tools?.length);
  process.exit(0);
});"
```

Check permissions:

```bash
podman exec LibreChat node -e "
require('./config/connect')().then(async () => {
  const { AclEntry } = require('./api/db/models');
  const { ResourceType, PrincipalType } = require('librechat-data-provider');
  const acl = await AclEntry.findOne({
    resourceType: ResourceType.AGENT,
    principalType: PrincipalType.PUBLIC
  }).populate('resourceId');
  console.log('Public ACL exists:', !!acl);
  console.log('Agent:', acl?.resourceId?.name);
  process.exit(0);
});"
```

## Troubleshooting

### Agent not visible to users

1. Check agent exists:
   ```bash
   podman exec LibreChat node -e "..." # (see Verifying Agent above)
   ```

2. Check PUBLIC permissions:
   ```bash
   # Run permission check command above
   ```

3. Recreate with force:
   ```bash
   podman exec LibreChat npm run create-ki-referent:force
   ```

### Agent behavior not as expected

1. Check instructions in database match script
2. Update script and recreate with `--force`
3. Clear browser cache and reload LibreChat

### Tools not working

1. Verify MCP servers are running:
   ```bash
   podman logs LibreChat | grep MCP
   ```

2. Check `librechat.yaml` has correct MCP server configuration
3. Restart LibreChat:
   ```bash
   podman-compose restart api
   ```

## Comparison with Old Approach

| Aspect | Old (Custom Instructions) | New (System Agent) |
|--------|--------------------------|-------------------|
| **Setup** | Each user manually | One-time by admin |
| **Maintenance** | Update each user | Update once |
| **Consistency** | Varies per user | Same for everyone |
| **Tools** | User-dependent | Centrally configured |
| **Discovery** | Users must know about it | Visible in agent list |
| **Updates** | Manual per user | Automatic on agent update |

## Benefits

1. **Easier onboarding** - New users get KI-Referent automatically
2. **Consistent experience** - Everyone uses the same configuration
3. **Centralized maintenance** - Update once, applies to all
4. **Better discoverability** - Visible in "My Agents" list
5. **Version control** - Agent changes are tracked in database
6. **Permission management** - Can grant/revoke access centrally

## Migration Path

For existing users with custom instructions:

1. System agent is now available to all
2. Users can choose to:
   - Use the system agent (recommended)
   - Keep using their custom instructions
   - Both (system agent + personal customizations)

No action required - the system agent is additive, doesn't remove personal settings.

## Future Enhancements

Possible improvements:

1. **Multiple versions** - Allow users to select specific agent versions
2. **Agent categories** - Group agents by function (integration, research, etc.)
3. **Usage analytics** - Track which agents are most used
4. **Agent templates** - Base new agents on system agents
5. **Role-based variants** - Different configurations for different user roles

## References

- Custom instructions guide: [KI-REFERENTIN-ANLEITUNG.md](./KI-REFERENTIN-ANLEITUNG.md)
- Agent API: `api/server/controllers/agents/v1.js`
- Permissions: `api/server/services/PermissionService.js`
- Agent schema: `packages/data-schemas/src/schema/agent.ts`
