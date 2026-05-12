# Model Spec Subfolder Support

This enhancement adds the ability to organize model specs into subfolders/categories for better organization and user experience.

## Feature Overview

Model specs can now be grouped into folders by adding an optional `folder` field to each spec. This helps organize related models together, making it easier for users to find and select the appropriate model for their needs.

## Configuration

### Basic Usage

Add a `folder` field to any model spec in your `librechat.yaml`:

```yaml
modelSpecs:
  list:
    - name: "gpt4_turbo"
      label: "GPT-4 Turbo"
      folder: "OpenAI Models"  # This spec will appear under "OpenAI Models" folder
      preset:
        endpoint: "openAI"
        model: "gpt-4-turbo-preview"
```

### Folder Structure

- **With Folder**: Model specs with the `folder` field will be grouped under that folder name
- **Without Folder**: Model specs without the `folder` field appear at the root level
- **Multiple Folders**: You can create as many folders as needed to organize your models
- **Alphabetical Sorting**: Folders are sorted alphabetically, and specs within folders are sorted by their `order` field or label

### Example Configuration

```yaml
modelSpecs:
  list:
    # OpenAI Models Category
    - name: "gpt4_turbo"
      label: "GPT-4 Turbo"
      folder: "OpenAI Models"
      preset:
        endpoint: "openAI"
        model: "gpt-4-turbo-preview"
      
    - name: "gpt35_turbo"
      label: "GPT-3.5 Turbo"
      folder: "OpenAI Models"
      preset:
        endpoint: "openAI"
        model: "gpt-3.5-turbo"
    
    # Anthropic Models Category
    - name: "claude3_opus"
      label: "Claude 3 Opus"
      folder: "Anthropic Models"
      preset:
        endpoint: "anthropic"
        model: "claude-3-opus-20240229"
    
    # Root level model (no folder)
    - name: "quick_chat"
      label: "Quick Chat"
      preset:
        endpoint: "openAI"
        model: "gpt-3.5-turbo"
```

## UI Features

### Folder Display
- Folders are displayed with expand/collapse functionality
- Folder icons change between open/closed states
- Indentation shows the hierarchy clearly

### Search Integration
- When searching for models, the folder path is shown for context
- Search works across all models regardless of folder structure

### User Experience
- Folders start expanded by default for easy access
- Click on folder header to expand/collapse
- Selected model is highlighted with a checkmark
- Folder state is preserved during the session

## Benefits

1. **Better Organization**: Group related models together (e.g., by provider, capability, or use case)
2. **Improved Navigation**: Users can quickly find models in organized categories
3. **Scalability**: Handles large numbers of model specs without overwhelming the UI
4. **Backward Compatible**: Existing configurations without folders continue to work
5. **Flexible Structure**: Mix foldered and non-foldered specs as needed

## Use Cases

### By Provider
```yaml
folder: "OpenAI Models"
folder: "Anthropic Models"
folder: "Google Models"
```

### By Capability
```yaml
folder: "Vision Models"
folder: "Code Models"
folder: "Creative Writing"
```

### By Performance Tier
```yaml
folder: "Premium Models"
folder: "Standard Models"
folder: "Budget Models"
```

### By Department/Team
```yaml
folder: "Engineering Team"
folder: "Marketing Team"
folder: "Research Team"
```

## Implementation Details

### Type Changes
- Added optional `folder?: string` field to `TModelSpec` type
- Updated `tModelSpecSchema` to include the folder field validation

### Components
- Created `ModelSpecFolder` component for rendering folder structure
- Updated `ModelSelector` to use folder-aware rendering
- Enhanced search results to show folder context

### Behavior
- Folders are collapsible with state management
- Models are sorted within folders by order/label
- Root-level models appear after all folders

## Migration

No migration needed - the feature is fully backward compatible. Existing model specs without the `folder` field will continue to work and appear at the root level.

## See Also

- `librechat.example.subfolder.yaml` - Complete example configuration
- GitHub Issue #9165 - Original feature request