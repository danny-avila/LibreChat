# Code Execution Renderer Demo

This document demonstrates the Code Execution Renderer functionality in LibreChat's enhanced content system.

## Overview

The Code Execution Renderer allows AI agents to include executable code blocks in their responses using the `[run:language]code[/run]` markup syntax. Users can then execute the code directly within the chat interface.

## Features

### 1. Syntax Highlighting
Code is displayed with proper syntax highlighting using MarkdownLite component.

### 2. Execute Button
Each code block includes an execute button that triggers code execution using LibreChat's existing Code Interpreter API.

### 3. Real-time Execution Status
- Shows "Executing code..." status during execution
- Displays execution time after completion
- Provides stop functionality for long-running code

### 4. Result Display
- Success results are shown in green with the output
- Error results are shown in red with error messages
- Execution time is displayed for both success and error cases

### 5. Security & Authentication
- Integrates with LibreChat's existing authentication system
- Shows API key dialog if user is not authenticated
- Uses secure sandboxed execution environment

## Usage Examples

### Python Code
```
[run:python]
print("Hello, World!")
for i in range(5):
    print(f"Count: {i}")
[/run]
```

### JavaScript Code
```
[run:javascript]
const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
console.log(`Sum: ${sum}`);
[/run]
```

### Data Analysis
```
[run:python]
import pandas as pd
import numpy as np

# Create sample data
data = {
    'name': ['Alice', 'Bob', 'Charlie'],
    'age': [25, 30, 35],
    'score': [85, 92, 78]
}

df = pd.DataFrame(data)
print(df)
print(f"\nAverage age: {df['age'].mean()}")
print(f"Average score: {df['score'].mean()}")
[/run]
```

## Technical Implementation

### Components
- **CodeExecutionRenderer**: Main component that renders the code execution interface
- **Integration**: Uses existing LibreChat Code Interpreter API endpoints
- **Authentication**: Leverages existing `useVerifyAgentToolAuth` and `useCodeApiKeyForm` hooks

### API Integration
- Uses `useToolCallMutation` with `Tools.execute_code`
- Integrates with existing message context for proper tracking
- Supports timeout handling (10-second limit)

### Error Handling
- Network errors are displayed with retry options
- Timeout errors show appropriate messages
- Invalid code/language combinations are handled gracefully

### Accessibility
- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader compatibility
- Focus management

### Mobile Optimization
- Touch-friendly buttons
- Responsive design
- Proper sizing for mobile devices

## Security Considerations

### Input Validation
- Code and language parameters are validated
- Malicious code patterns are handled by the backend sandbox

### Execution Environment
- Code runs in LibreChat's existing secure sandbox
- Resource limits and timeouts prevent abuse
- Network access is controlled by the backend

### Authentication
- Requires valid API key for code execution
- Integrates with existing user authentication system

## Performance Features

### Execution Tracking
- Real-time execution status updates
- Execution time measurement and display
- Proper cleanup of resources

### Error Recovery
- Graceful handling of execution failures
- Clear error messages for debugging
- Automatic cleanup on component unmount

## Browser Compatibility

The Code Execution Renderer works across all modern browsers and includes:
- Fallback handling for unsupported features
- Progressive enhancement
- Responsive design for all screen sizes

## Testing

Comprehensive test coverage includes:
- Unit tests for all component functionality
- Integration tests with LibreChat APIs
- Error handling and edge case testing
- Accessibility and keyboard navigation tests
- Mobile responsiveness testing

## Future Enhancements

Potential future improvements:
- Support for additional programming languages
- Code completion and IntelliSense
- Execution history and caching
- Advanced debugging features
- Collaborative code editing