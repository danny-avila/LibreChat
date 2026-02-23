# Agent Auto-Selection Feature

## Overview

This feature automatically selects the first available agent when users visit the landing page for the first time or on initial page load, providing a smooth onboarding experience.

## How It Works

1. **Landing Page Load**: When the user lands on the chat page without an agent already selected
2. **Agents Available Check**: If agents are available and `showAgentButtons` is enabled
3. **Auto-Selection**: The first agent from the available agents list is automatically selected
4. **Conversation Initialization**: A new conversation with the selected agent is started

## Configuration

The auto-selection behavior can be controlled through the **`agentDefaults.ts`** configuration file:

```typescript
// src/config/agentDefaults.ts
export const AGENT_DEFAULTS: AgentDefaultsConfig = {
  // ... other settings ...
  autoSelectFirstAgent: true,  // Set to false to disable auto-selection
  showAgentButtons: true,      // Must be true for auto-selection to work
};
```

### Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `autoSelectFirstAgent` | boolean | `true` | Enable/disable auto-selection of first agent |
| `showAgentButtons` | boolean | `true` | Show agent selection buttons (required for auto-selection) |
| `showModelSelector` | boolean | `true` | Show model selector in header |

## Features

✅ **First-Visit Detection**: Auto-selection only happens once per page visit using `hasAutoSelectedAgent` state

✅ **Respects Existing Selection**: If an agent is already selected, auto-selection is skipped

✅ **Configurable**: Can be easily enabled/disabled in the config file

✅ **Clean UX**: Users don't need to manually select an agent on first visit

## Usage

### Enable (Default)
```typescript
autoSelectFirstAgent: true  // Automatically selects first agent
```

### Disable
```typescript
autoSelectFirstAgent: false  // Users must manually select an agent
```

## Implementation Details

### Key Components

- **Landing.tsx**: Contains the auto-selection logic in a `useEffect` hook
- **agentDefaults.ts**: Configuration and helper functions
- **useSelectAgent Hook**: Handles the actual agent selection and conversation creation

### Auto-Selection Logic Flow

```
Landing Page Load
    ↓
Check shouldAutoSelectFirstAgent() config
    ↓
Check if agent already selected
    ↓
Get first agent from agentsMap
    ↓
Call onSelectAgent(firstAgent.id)
    ↓
New conversation created with selected agent
```

## Testing

To verify auto-selection is working:

1. **Enable feature** in `agentDefaults.ts`:
   ```typescript
   autoSelectFirstAgent: true
   ```

2. **Navigate to landing page** (`/c/new`)

3. **Verify behavior**:
   - If agents are available, first agent should be automatically selected
   - Conversation should switch to the selected agent
   - Agent name should appear in the header/display

4. **Disable to test manual selection**:
   ```typescript
   autoSelectFirstAgent: false
   ```
   - Agents buttons should be visible
   - First agent should NOT auto-select
   - Users must manually click an agent button

## Notes

- Auto-selection respects the `shouldShowAgentButtons()` setting
- If no agents are available, auto-selection is skipped gracefully  
- The feature integrates seamlessly with the existing agent selection system
- The `hasAutoSelectedAgent` state prevents unnecessary re-selections

## Related Files

- `src/config/agentDefaults.ts` - Configuration file
- `src/components/Chat/Landing.tsx` - Landing page component with auto-selection logic
- `src/hooks/Agents/useSelectAgent.ts` - Hook for agent selection
