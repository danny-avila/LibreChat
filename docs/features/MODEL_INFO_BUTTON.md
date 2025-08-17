# Model Information Button Feature

## Overview
The Model Information Button is a new UI feature that displays detailed metadata about AI-generated responses in LibreChat. It appears as the 8th button in the hover button group for each AI message, providing users with transparent information about which model generated each response.

## Features

### 🔍 Information Display
The button displays the following information on hover:
- **Model**: Exact model name or label (e.g., "GPT-4 Turbo", "Claude 3 Opus")
- **Provider**: Service provider and type (e.g., "openai (azure)", "anthropic")
- **Timestamp**: Localized date and time when the response was generated
- **Message ID**: Unique identifier for the message (truncated for readability)
- **Finish Reason**: How the model stopped generating (e.g., "stop", "length", "tool_calls")
- **Error Status**: Visual indicator if the response encountered an error

### 🎯 Interactive Features
- **Hover to View**: Displays information in a tooltip on hover
- **Click to Copy**: Clicking the button copies all model information to clipboard
- **Visual Feedback**: Shows a checkmark icon for 2 seconds after successful copy
- **Accessibility**: Fully keyboard navigable with proper ARIA attributes

## Implementation Details

### Components Modified

#### 1. **InfoIcon Component** (`packages/client/src/svgs/InfoIcon.tsx`)
- Custom SVG icon with a circled "i" design
- Matches the visual style of existing hover buttons
- Supports theming through `currentColor`
- Accepts custom size and className props

#### 2. **HoverButtons Component** (`client/src/components/Chat/Messages/HoverButtons.tsx`)
- Added `formatModelInfo` utility function for data extraction
- Integrated model info button with tooltip functionality
- Implemented clipboard copy with visual feedback
- Memoized model information for performance

#### 3. **Localization** (`client/src/locales/en/translation.json`)
- Added `com_ui_model_info` translation key
- Supports internationalization for button title

### Technical Specifications

#### Props and Types
```typescript
// InfoIcon Props
interface InfoIconProps {
  className?: string;  // Additional CSS classes
  size?: string;      // Icon size (default: '1em')
}

// formatModelInfo Function
function formatModelInfo(
  message: TMessage,
  conversation: TConversation | null
): string
```

#### Performance Optimizations
- Uses `useMemo` to cache formatted model information
- Prevents unnecessary recalculations on re-renders
- Efficient string concatenation for tooltip content

#### Accessibility Features
- Unique `id` attributes for each button instance
- `aria-hidden="true"` on decorative icon elements
- `role="tooltip"` for proper screen reader support
- Keyboard navigable with standard tab navigation

## Testing

### Test Coverage
The feature includes comprehensive test suites:

1. **InfoIcon Component Tests** (`InfoIcon.test.tsx`)
   - Rendering and prop handling
   - SVG structure validation
   - Theming and styling
   - Snapshot testing

2. **HoverButtons Integration Tests** (`HoverButtons.ModelInfo.test.tsx`)
   - Button visibility rules (AI vs user messages)
   - Clipboard functionality
   - Visual feedback states
   - Tooltip content accuracy
   - Error handling

3. **Utility Function Tests** (`formatModelInfo.test.ts`)
   - Data extraction logic
   - Fallback handling
   - Timestamp formatting
   - Edge cases

### Running Tests
```bash
# Run all client tests
npm run test:client

# Run specific test file
npm test -- InfoIcon.test.tsx

# Run with coverage
npm test -- --coverage
```

## Usage Examples

### Basic Usage
The button appears automatically for all AI-generated messages. No configuration required.

### Viewing Model Information
1. Hover over any AI response in the chat
2. Look for the info icon (ⓘ) in the button group
3. Hover over the icon to see model details
4. Click to copy information to clipboard

### Information Format
```
Model: GPT-4 Turbo
Provider: openai (azure)
Timestamp: Jan 15, 2024, 10:30:45 AM
Message ID: msg-abc123...
Finish: stop
```

## Browser Compatibility
- Modern browsers with Clipboard API support
- Fallback for browsers without clipboard access
- Responsive design for mobile and desktop

## Future Enhancements

### Planned Features
1. **Rich HTML Tooltips**: Styled tooltips with better formatting
2. **Token Usage**: Display token count information
3. **Response Time**: Calculate and show generation duration
4. **Model Parameters**: Show temperature, top_p, and other settings
5. **Keyboard Shortcuts**: Quick access via keyboard (e.g., Alt+I)
6. **Persistent Modal**: Option for detailed view in modal dialog
7. **Export Feature**: Export full conversation metadata

### Customization Options
Future versions may include:
- User preferences for displayed information
- Custom tooltip positioning
- Theme-specific icon variants
- Configurable copy formats

## Troubleshooting

### Common Issues

1. **Button not appearing**
   - Ensure the message is AI-generated (not user message)
   - Check if conversation object is properly loaded
   - Verify component imports are correct

2. **Clipboard not working**
   - Check browser clipboard permissions
   - Ensure HTTPS connection (required for clipboard API)
   - Try different browser if issue persists

3. **Tooltip not showing**
   - Verify TooltipAnchor component is imported
   - Check for CSS conflicts with tooltip styles
   - Ensure proper hover event handling

## Contributing
When contributing to this feature:
1. Follow the existing code style and patterns
2. Add tests for new functionality
3. Update this documentation for significant changes
4. Ensure accessibility standards are maintained
5. Test across different browsers and devices

## Related Files
- `/packages/client/src/svgs/InfoIcon.tsx` - Icon component
- `/client/src/components/Chat/Messages/HoverButtons.tsx` - Main implementation
- `/client/src/locales/*/translation.json` - Translations
- Test files in `__tests__` directories

## License
This feature is part of LibreChat and follows the project's MIT license.