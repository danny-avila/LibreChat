# Model Pricing Configuration

LibreChat now supports displaying pricing information for models in the model selection menu. This feature allows users to see the cost per million tokens for both input and output operations.

## Configuration Options

Pricing information can be configured in two ways:

1. **Automatic Pricing from LiteLLM**: LibreChat will attempt to automatically fetch pricing data from the [LiteLLM model pricing data](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) for known models.

2. **Manual Configuration in librechat.yaml**: You can manually specify pricing information for models directly in your configuration file.

## Adding Pricing to Model Specs

To add pricing information to your models, you can extend the model spec configuration in your `librechat.yaml` file:

```yaml
# Example modelSpecs configuration with pricing
specsOverrides:
  list:
    - name: 'gpt-4'
      label: 'GPT-4'
      description: 'Most capable OpenAI model for complex tasks'
      pricing:
        inputPrice: 30.00 # Price per million tokens for input
        outputPrice: 60.00 # Price per million tokens for output
        showPricing: true # Set to false to hide pricing badges

    - name: 'gpt-3.5'
      label: 'GPT-3.5'
      description: 'Efficient model for standard tasks'
      pricing:
        inputPrice: 0.50 # Price per million tokens for input
        outputPrice: 1.50 # Price per million tokens for output

    # Example of disabling pricing display for a specific model
    - name: 'custom-model'
      label: 'Custom Model'
      pricing:
        showPricing: false # Hide pricing information
```

## Pricing Format

Prices are specified per million tokens:

- `inputPrice`: The cost in USD per 1 million input tokens
- `outputPrice`: The cost in USD per 1 million output tokens

For example, if a model costs $0.00003 per output token, you would set `outputPrice: 30.00` (because $0.00003 × 1,000,000 = $30.00).

## UI Display

When properly configured, pricing information appears as badges below the model description in the model selection menu:

- Input costs appear as blue badges labeled "IN $X.XX/1M"
- Output costs appear as purple badges labeled "OUT $X.XX/1M"

## Simple Model Name Matching

The system uses a straightforward matching algorithm that preserves the exact model names as they appear in LiteLLM:

### 1. Exact Match (Highest Priority)

First, the system attempts to find an exact match between your model name and the LiteLLM pricing data.

### 2. Case-Insensitive Match

If no exact match is found, it tries a case-insensitive match to handle capitalization differences.

This approach ensures that provider prefixes and version formats are preserved exactly as they appear in LiteLLM's pricing data.

## Performance Optimization

To improve performance, the system:

1. **Caches Pricing Data** at the application level, fetched once and reused across all components
2. **Caches Model Matches** to avoid redundant lookups for the same model
3. **Only Updates** when pricing data is refreshed (once every 24 hours)

This minimizes API calls and computational overhead, especially when opening the model selection menu multiple times.

## Fallback Behavior

The system follows this hierarchy to determine what pricing to display:

1. If manual pricing is specified in the model spec, it uses those values
2. If not, it tries to find the model in the LiteLLM pricing data using the simple matching algorithm
3. If neither source provides pricing data, no pricing badges are shown

## Automatic Number Formatting

Prices are automatically formatted according to these rules:

- Prices ≥ $100/million tokens: Displayed with no decimal places (e.g., "$300/1M")
- Prices ≥ $10/million tokens: Displayed with 1 decimal place (e.g., "$30.5/1M")
- Prices < $10/million tokens: Displayed with 2 decimal places (e.g., "$3.50/1M")
