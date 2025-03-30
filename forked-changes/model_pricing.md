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

## Prioritized Model Name Matching

The system includes a multi-stage matching algorithm to link your models with pricing data from LiteLLM. It follows a clear priority order:

### 1. Exact Match (Highest Priority)

First, the system looks for an exact match between your model name and LiteLLM pricing data. This is always prioritized if found.

### 2. Case-Insensitive Exact Match

If no exact match is found, it tries a case-insensitive comparison to catch variations in capitalization.

### 3. Normalized Exact Match

If still no match, the system applies normalization to both names:

- **Provider Prefix Removal**: Common provider prefixes are automatically removed, such as:

  - `openai/`, `gemini/`, `perplexity/`, `anthropic/`, `bedrock/`, `cohere/`, etc.

- **Standardizing Version Formats**: Converting version notations like `2.0` to `2-0`

- **Removing Version Suffixes**: Automatically handles model version numbers and date-based suffixes:
  - Common suffixes like `-latest`, `-preview`, `-high`, `-low`, `-reasoning`, `-turbo`, `-vision`
  - Version date suffixes like `-0314`, `-2407`, `-2024-05-13`

### 4. Fuzzy Matching (Last Resort)

Only if no exact or normalized matches are found, the system uses a sophisticated similarity algorithm:

- **Word-based Similarity**: Breaks names into segments for comparison
- **Exact Word Matching**: Gives higher score to exact word matches
- **Partial Word Matching**: Considers partial matches with proportional scoring
- **Length and Position Scoring**: Adjusts scores based on relative length and match position

Matches must exceed a similarity threshold (0.5) to be considered valid.

## Match Logging

The system logs each match type for debugging:

- `Model exact match: 'modelName'`
- `Model case-insensitive match: 'modelName' → 'matchedName'`
- `Model normalized match: 'modelName' → 'matchedName'`
- `Model fuzzy match: 'modelName' → 'matchedName' (score: 0.75)`

## Fallback Behavior

The system follows this hierarchy to determine what pricing to display:

1. If manual pricing is specified in the model spec, it uses those values
2. If not, it tries to find the model in the LiteLLM pricing data using the prioritized matching algorithm
3. If neither source provides pricing data, no pricing badges are shown

## Automatic Number Formatting

Prices are automatically formatted according to these rules:

- Prices ≥ $100/million tokens: Displayed with no decimal places (e.g., "$300/1M")
- Prices ≥ $10/million tokens: Displayed with 1 decimal place (e.g., "$30.5/1M")
- Prices < $10/million tokens: Displayed with 2 decimal places (e.g., "$3.50/1M")
