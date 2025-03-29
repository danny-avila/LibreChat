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

## Fallback Behavior

The system follows this hierarchy to determine what pricing to display:

1. If manual pricing is specified in the model spec, it uses those values
2. If not, it tries to find the model in the LiteLLM pricing data
3. If neither source provides pricing data, no pricing badges are shown

## Automatic Number Formatting

Prices are automatically formatted according to these rules:

- Prices ≥ $100/million tokens: Displayed with no decimal places (e.g., "$300/1M")
- Prices ≥ $10/million tokens: Displayed with 1 decimal place (e.g., "$30.5/1M")
- Prices < $10/million tokens: Displayed with 2 decimal places (e.g., "$3.50/1M")
