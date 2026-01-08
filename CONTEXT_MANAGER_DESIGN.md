# Context Manager Architecture Design

**Date**: 2026-01-08  
**Status**: Implementing  
**Goal**: Eliminate LLM guessing by providing explicit, structured context

## 🎯 Problem Statement

### Current Issues
1. **File Path Confusion**: LLM uses UUID-prefixed filenames (e.g., `21751ac2-...__titanic.csv`) instead of clean names
2. **Information Scattered**: Context spread across system prompt, history messages, tool responses
3. **LLM Guessing**: Model infers information from incomplete/ambiguous sources
4. **No Error Recovery**: Generic error messages without actionable guidance

### Root Cause
- Internal IDs (file_id, UUIDs) leaked into LLM-facing data
- No centralized context management
- Implicit assumptions about what LLM "should know"

## 🏗️ Solution Architecture

### Core Principle: **Single Source of Truth**

```
┌─────────────────────────────────────────────────────────┐
│                   Context Manager                        │
│     (Centralized state management for LLM context)      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📁 Files Context                                        │
│     • Complete file paths + usage examples              │
│     • /home/user/titanic.csv                            │
│     • NEVER expose file_id/UUID                         │
│                                                          │
│  📊 Artifacts Context                                    │
│     • Generated images, models, reports                 │
│     • Full paths for reference                          │
│                                                          │
│  📝 Analysis History                                     │
│     • Completed analyses in this session                │
│     • Prevents redundant work                           │
│                                                          │
│  🔧 Sandbox State                                        │
│     • Working directory, Python version                 │
│     • Resource limits                                   │
│                                                          │
│  ⚠️ Error Recovery                                       │
│     • Context-aware recovery guidance                   │
│     • Specific solutions for each error type            │
│                                                          │
└─────────────────────────────────────────────────────────┘
           ↓ Injected into every LLM call
┌─────────────────────────────────────────────────────────┐
│      Base System Prompt + Dynamic Context               │
│  = Static instructions + Real-time session state        │
└─────────────────────────────────────────────────────────┘
```

## 📦 Implementation Components

### 1. ContextManager Class (`contextManager.js`)

**Responsibilities**:
- Maintain session state (files, artifacts, analyses)
- Generate structured context strings
- Provide error-specific recovery guidance
- Log state changes for debugging

**Key Methods**:
```javascript
class ContextManager {
  // State updates
  updateUploadedFiles(files)
  addGeneratedArtifact(artifact)
  recordAnalysis(analysis)
  
  // Context generation
  generateSystemContext()          // For system prompt injection
  generateErrorRecoveryContext(error)  // For error handling
  
  // Utility
  getSummary()
  reset()
}
```

### 2. Integration Points

#### A. E2BAgent (index.js)
- Initialize ContextManager on agent creation
- Update file state when files uploaded
- Inject dynamic context into system prompt
- Pass context manager to tools

#### B. Tools (tools.js)
- Track generated artifacts (images)
- Record completed analyses
- Use context manager for error recovery
- Remove all file_id exposures

#### C. Controller (controller.js)
- Pass files to agent for context update
- Ensure no file_id in history messages

## 🎯 Context Types & Examples

### Files Context
```
## 📁 AVAILABLE FILES IN SANDBOX

  📄 titanic.csv
     Path: /home/user/titanic.csv
     Usage: df = pd.read_csv('/home/user/titanic.csv')

  📄 sales_data.xlsx
     Path: /home/user/sales_data.xlsx
     Usage: df = pd.read_excel('/home/user/sales_data.xlsx')

⚠️ CRITICAL RULES:
1. Use COMPLETE paths exactly as shown above
2. NEVER add UUID, prefix, or modify the filename
3. If file not found, check spelling matches exactly
```

### Artifacts Context
```
## 📊 PREVIOUSLY GENERATED ARTIFACTS

  • plot-0.png (image): Age distribution histogram
  • plot-1.png (image): Survival rate by class
  • correlation_matrix.png (image): Feature correlations

Note: These are available for reference but may have been from previous analyses.
```

### Analysis History
```
## 📝 ANALYSIS HISTORY (This Session)

  • exploratory_data_analysis: Examined 891 rows, 12 columns, identified missing values in Age (177), Cabin (687)
  • visualization: Created 3 plots showing age distribution, survival rates
  • correlation_analysis: Found strong correlation between Pclass and Survival (-0.34)

Use this context to avoid repeating work and build upon previous findings.
```

### Error Recovery Context
```
## ⚠️ ERROR RECOVERY CONTEXT

❌ FileNotFoundError: '/home/user/25bd6749-c916-4e1c-9c19-cf14de9086be__titanic.csv'

✅ Available files in /home/user/:
  • titanic.csv → use path: /home/user/titanic.csv

💡 SOLUTION: Use the EXACT paths shown above.
   Common mistake: Adding UUID prefix - this is WRONG!
   
Correct code:
df = pd.read_csv('/home/user/titanic.csv')
```

## 📋 Implementation Checklist

### Phase 1: Core Context Manager ✅
- [x] Create contextManager.js with full implementation
- [ ] Add unit tests for context generation
- [ ] Add state persistence (optional)

### Phase 2: Integration ⏳
- [ ] Integrate into E2BAgent constructor
- [ ] Update processMessage to inject context
- [ ] Pass contextManager to tools
- [ ] Update tools to track artifacts
- [ ] Remove all file_id exposures

### Phase 3: Testing 🔄
- [ ] Test Round 1: File upload → Context recorded
- [ ] Test Round 2: File reference → Correct path used
- [ ] Test Error case → Recovery guidance shown
- [ ] Test Multiple files → All paths listed
- [ ] Test Long session → History tracking works

### Phase 4: Monitoring 📊
- [ ] Add logging for context injections
- [ ] Monitor LLM file path usage
- [ ] Track error recovery success rate
- [ ] Measure context size impact on tokens

## 🔒 Design Principles

### 1. Explicit over Implicit
**Bad**: "User uploaded a file"  
**Good**: "File titanic.csv available at /home/user/titanic.csv - use pd.read_csv('/home/user/titanic.csv')"

### 2. No Internal IDs
**Bad**: `file_id: "21751ac2-77a4-4240-ab1f-e1275bd675b6"`  
**Good**: `filename: "titanic.csv"`

### 3. Action-Oriented
**Bad**: "Files are in the sandbox"  
**Good**: "Use: df = pd.read_csv('/home/user/titanic.csv')"

### 4. Error-Specific Guidance
**Bad**: "File not found"  
**Good**: "FileNotFoundError → Available files: [list] → Use exact paths"

### 5. Structured & Hierarchical
Use clear sections with headers, emojis for visual parsing, bullet points for lists

## 🚀 Expected Outcomes

### Before Context Manager
```
Round 1: ✅ Success (fresh context)
Round 2: ❌ FileNotFoundError (UUID prefix)
         ❌ No recovery (LLM invents old image paths)
```

### After Context Manager
```
Round 1: ✅ Success + context recorded
Round 2: ✅ Success (explicit path in system context)
Error:   ✅ Recovery guidance → LLM fixes → Success
```

### Metrics
- **File Path Accuracy**: 100% (no UUID confusion)
- **Error Recovery Rate**: >90% (specific guidance)
- **Context Clarity**: Explicit paths, no guessing
- **Extensibility**: Easy to add new context types

## 🔧 Future Extensions

### Database Context
```javascript
contextManager.addDatabaseConnection({
  name: 'customer_db',
  type: 'postgresql',
  connection: 'Use: conn = psycopg2.connect(...)',
  tables: ['users', 'orders', 'products']
});
```

### API Context
```javascript
contextManager.addAPICredential({
  service: 'OpenWeatherMap',
  endpoint: 'https://api.openweathermap.org/data/2.5/weather',
  usage: 'requests.get(endpoint, params={"q": city, "appid": API_KEY})'
});
```

### Model Context
```javascript
contextManager.recordModelTraining({
  model_type: 'RandomForest',
  accuracy: 0.856,
  features: ['age', 'fare', 'pclass'],
  saved_path: '/home/user/rf_model.pkl'
});
```

## 📝 Notes

- Context Manager is stateful per conversation
- State resets when conversation ends
- All context strings are token-optimized
- Compatible with streaming responses
- No breaking changes to existing API

## 🔗 Related Changes

1. **tools.js**: Remove file_id from observation, add artifact tracking
2. **index.js**: Integrate ContextManager, inject dynamic context
3. **controller.js**: Ensure no file_id in history
4. **prompts.js**: Enhanced with file path rules

## ✅ Success Criteria

1. **Zero UUID Confusion**: LLM never uses UUID-prefixed filenames
2. **100% Path Accuracy**: Always uses correct /home/user/filename paths
3. **Effective Recovery**: Errors followed by correct retry >90%
4. **Clear Context**: Developers can see exactly what LLM sees
5. **Extensible**: New context types added in <1 hour

---

**Last Updated**: 2026-01-08  
**Author**: AI Architecture Team  
**Review Status**: Ready for Implementation
