# Model Pricing Feature Implementation

This fork adds support for displaying pricing information for models in the model selection menu. The feature allows users to see the cost per million tokens for both input and output operations.

## Features Added

1. **Pricing Configuration in TModelSpec**:

   - Added pricing fields to the model specification interface
   - Support for manual input/output pricing
   - Option to enable/disable pricing display per model

2. **Automatic Pricing from LiteLLM**:

   - Fallback to pricing data from LiteLLM when manual pricing is not specified
   - Caching mechanism for pricing data to reduce API calls

3. **UI Components**:
   - Price badges for input and output pricing
   - Consistent formatting based on price magnitude

## Implementation Details

### Data Provider Changes

- Extended `TModelSpec` interface to include pricing configuration
- Added schema validation for pricing fields

### Utility Functions

- Created a `useModelPricing` hook to retrieve pricing data
- Implemented the `PriceBadge` component for consistent display
- Added utility for price formatting

### Model Selection UI

- Updated the `ModelSpecItem` component to display pricing badges

## How to Use

See [model_pricing.md](./model_pricing.md) for detailed documentation on how to configure and use the model pricing feature.

## Example Configuration

Example model configuration with pricing can be found in [example-config.yaml](./example-config.yaml).

## Design Decisions

1. **Isolated Changes**:

   - All changes have been kept minimal and isolated to reduce the risk of merge conflicts when updating from upstream.

2. **Component Encapsulation**:

   - The `PriceBadge` component is defined in the utility file rather than as a separate component to reduce the number of files modified.

3. **No Description Processing**:

   - Removed the description processing code that was in the PR to avoid modifying the description strings.

4. **Backward Compatibility**:
   - Pricing display is optional and won't affect existing models without pricing configuration.
