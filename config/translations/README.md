## Translations

### Requirements:
- All dependencies installed, run `npm ci` in the root directory.
- bun: https://bun.sh/
- `ANTHROPIC_API_KEY` in project root directory `.env` file.

### ⚠️ Warning:

This script can be expensive, several dollars worth, even with prompt caching. It can also be slow if has not been ran in a while, with translations contributed.

### Instructions:

1. Main script: Run `bun config/translations/scan.ts` from the root directory.
2. Observe translations being generated in all supported languages.
  - Supported languages are localizations with general translation prompts:
      - These prompts are directly found in `client/src/localization/prompts`.