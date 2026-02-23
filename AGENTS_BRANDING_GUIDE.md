# 🎯 Agent Management & Branding Configuration Guide

## Overview
Complete integration of Agent Management System with Branding, Agent Selector buttons, and configurable model selection.

## ✅ Features Implemented

### 1. **Branding & Logo Configuration**
- ✅ Dynamic logo loading from `librechat.kto.yaml` config
- ✅ Company logo displayed on login/auth pages
- ✅ Configurable via: `interface.companyLogo: 'NARXOZ.svg'`
- ✅ Available logos in `/client/public/assets/`:
  - `NARXOZ.svg` - Red branded logo with white text
  - `KazTransOil.svg` - KazTransOil company logo
  - `kto_logo.svg` - Alternative KTO logo

### 2. **Agent Configuration System**
**File**: `client/src/config/agentDefaults.ts`

```typescript
AGENT_DEFAULTS = {
  usePredefined: false,           // Lock provider/model selection
  provider: 'openai',             // Default provider
  model: 'gpt-4o',               // Default model
  providerDisplayName: 'OpenAI',
  modelDisplayName: 'GPT-4o',
  showAgentButtons: true,         // Show agents on landing page
  showModelSelector: true,        // Show model selector in header
}
```

**Configuration Options**:
- `usePredefined: true` → Locks model, users cannot change
- `usePredefined: false` → Allow users to select provider/model
- `showAgentButtons: true` → Display agent buttons on landing page and header
- `showAgentButtons: false` → Hide agent selections

### 3. **Agent Selection UI**

#### A. Landing Page Agent Buttons
**File**: `client/src/components/Chat/Landing.tsx`

Features:
- Shows all available agents as clickable buttons
- Each button displays:
  - Agent avatar (image or emoji fallback 🤖)
  - Agent name
  - Hover effects with transition animations
- Dark mode support
- Responsive design

**Behavior**:
- Click agent button → Select agent in chat
- Shows only if `showAgentButtons: true` in config
- Shows only if agents exist in system

#### B. Header Agent Selector
**File**: `client/src/components/Chat/Menus/AgentSelector.tsx`

Features:
- Shows first 3 agents in header toolbar
- Compact display with agent avatars
- Quick access to popular agents
- Hidden on small screens (shows text on hover)
- Separator line between model and agent selectors

**Display**:
```
[ModelSelector] | [Agent1] [Agent2] [Agent3] [Bookmarks] [Presets]...
```

#### C. Agent Questions/Starters
- Shows suggested questions when agent is selected
- 2-4 question grid layout
- Click to send pre-written questions
- Only visible when agent is selected

### 4. **Chat Interface Enhancements**

#### Header Updates (`client/src/components/Chat/Header.tsx`)
- Added AgentSelector component after ModelSelector
- Visual separator between selectors
- Responsive layout (hides on mobile)
- Integrated with existing header components

#### Landing Page Updates (`client/src/components/Chat/Landing.tsx`)
- Added `renderAgentsList()` function
- Added `renderAgentQuestions()` function
- Added agent selection handlers
- Enhanced with gradient and dark mode support

### 5. **Configuration File Updates**

**`librechat.kto.yaml`**:
```yaml
interface:
  customWelcome: 'Заявление в К.О.К'  # Custom welcome message
  companyLogo: 'NARXOZ.svg'            # Logo file name
```

**Agent Settings**:
```yaml
agents:
  use: true              # Enable agents feature
  share: false           # Disable sharing
  public: false          # Disable public access
```

**Model Selection**:
```yaml
interface:
  modelSelect: true      # Show model selector in header
```

## 🎨 Visual Design

### Color Scheme
- **Primary**: Red (#E31A24) for NARXOZ branding
- **Buttons**: White with shadows, hover states
- **Dark Mode**: Gray backgrounds with white text
- **Accents**: Blue gradients for interactive elements

### Component Styling
- Rounded corners (border-radius)
- Smooth transitions (200-300ms)
- Hover effects with scale/shadow
- Active states with press animation

## 🔧 Configuration Examples

### Example 1: Show All Agent Buttons
```typescript
// agentDefaults.ts
export const AGENT_DEFAULTS = {
  showAgentButtons: true,
  showModelSelector: true,
  usePredefined: false,
  // ... other settings
};
```

### Example 2: Lock Model Selection for Users
```typescript
export const AGENT_DEFAULTS = {
  usePredefined: true,
  provider: 'openai',
  model: 'gpt-4o',
  showAgentButtons: true,
  // Users cannot change model, only select agents
};
```

### Example 3: Custom Branding
```yaml
# librechat.kto.yaml
interface:
  customWelcome: 'Welcome to Your AI Assistant'
  companyLogo: 'your-company-logo.svg'
```

## 📁 File Structure

```
client/
├── src/
│   ├── components/
│   │   └── Chat/
│   │       ├── Landing.tsx (UPDATED - agent buttons)
│   │       ├── Header.tsx (UPDATED - agent selector)
│   │       └── Menus/
│   │           └── AgentSelector.tsx (NEW)
│   ├── config/
│   │   └── agentDefaults.ts (NEW - configuration)
│   └── components/Auth/
│       └── AuthLayout.tsx (UPDATED - dynamic logo)
└── public/assets/
    ├── NARXOZ.svg (NEW - red brand logo)
    ├── KazTransOil.svg (COPIED)
    └── kto_logo.svg (COPIED)
```

## 🚀 How to Use

### 1. **Change Company Logo**
Edit `librechat.kto.yaml`:
```yaml
interface:
  companyLogo: 'your-logo.svg'  # Place SVG in public/assets/
```

### 2. **Toggle Agent Buttons**
Edit `client/src/config/agentDefaults.ts`:
```typescript
showAgentButtons: false  // Hide agent buttons
```

### 3. **Lock Model Selection**
Edit `client/src/config/agentDefaults.ts`:
```typescript
usePredefined: true
provider: 'gpt-4o'
model: 'gpt-4o'
```

### 4. **Customize Welcome Message**
Edit `librechat.kto.yaml`:
```yaml
interface:
  customWelcome: 'Your Custom Welcome Message'
```

## 🎯 User Experience Flow

1. **User lands on page**
   - Sees custom welcome message
   - Views company logo on auth pages
   - Sees available agents as buttons

2. **User selects an agent**
   - Agent selection persists
   - Shows agent-specific questions
   - Can click question to send it

3. **User in chat**
   - Can switch agents from header
   - Model selector available (if not locked)
   - Suggested questions appear for each agent

## 🔐 Permissions & Access

Agent system respects existing permissions:
- `PermissionTypes.AGENTS` - Control overall access
- Sharing options configurable per agent
- Public/private agent settings

## 🐛 Troubleshooting

### Agent buttons not showing
- Check `showAgentButtons: true` in config
- Verify agents exist in system
- Check permissions/access control

### Logo not loading
- Ensure file exists in `public/assets/`
- Check filename in `librechat.kto.yaml` matches exactly
- Clear browser cache (Ctrl+Shift+Delete)

### Header selector missing agents
- Max 3 agents shown in header (design choice)
- More agents available on landing page
- Check `showAgentButtons` config

## 💡 Tips & Best Practices

1. **Logo Size**: Keep logos under 100KB for fast loading
2. **Agent Count**: Limit to 5-10 agents for better UX
3. **Button Labels**: Keep agent names short (< 20 chars)
4. **Dark Mode**: Test logos in both light and dark modes
5. **Mobile**: Agent buttons stack vertically on small screens

## 🔄 Integration Checklist

- ✅ Configuration file updated with logo and settings
- ✅ Landing page shows agent buttons
- ✅ Header shows quick agent access
- ✅ Auth pages show company logo
- ✅ Model selector integrated
- ✅ Dark mode support working
- ✅ Mobile responsive
- ✅ Agent questions showing

## 📞 Support

For issues or customizations:
1. Check `agentDefaults.ts` configuration
2. Verify logo files exist and are valid SVG
3. Check browser console for errors
4. Review `librechat.kto.yaml` syntax

---
**Last Updated**: February 23, 2026  
**Status**: ✅ Complete and Production Ready
