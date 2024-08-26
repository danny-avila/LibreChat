## Translations

### Requirements:
- All dependencies installed, run `npm ci` in the root directory.
- bun: https://bun.sh/
- `ANTHROPIC_API_KEY` in project root directory `.env` file.

### ⚠️ Warning:

This script can be expensive, several dollars worth, even with prompt caching. It can also be slow if has not been ran in a while, with translations contributed.

### Instructions:

1. (Optional) Run the instructions template script: `bun config/translations/instructions.ts` from the root directory.
  - This generates a "comparisons" prompt for the AI to review, the outputs of which are saved in `client/src/localization/prompts/instructions`.
2. Main script: Run `bun config/translations/scan.ts` from the root directory.
3. Observe translations being generated in all supported languages.
  - Supported languages are localizations with general translation prompts, the files directly found in `client/src/localization/prompts`.
  - Instructions 