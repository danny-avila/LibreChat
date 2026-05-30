## Translations

### Requirements:
- All dependencies installed, run `npm ci` in the root directory.
- bun: https://bun.sh/
- `ANTHROPIC_API_KEY` in project root directory `.env` file.

### ⚠️ Warning:

This script can be expensive, several dollars worth, even with prompt caching. It can also be slow if it has not been run in a while, with translations contributed.

### Instructions:

*All commands are run from the root directory.*

**Supported languages are localizations with general translation prompts**
- These prompts are directly found in `client/src/localization/prompts`.
- If your language is missing, you can contribute by adding a new file in `client/src/localization/prompts` with the language code as the file name.

0. Make sure git history is clean with `git status`.
1. Install `hnswlib-node` package temporarily (we don't need to include it in the project):
```bash
npm install --save-dev hnswlib-node
```
2. Run `bun install`.
3. Main script: Run `bun config/translations/scan.ts`.
4. Observe translations being generated in all supported languages and saved in `client/src/localization/languages`.
  - e.g.: `client/src/localization/languages/Es_missing_keys.json`
5. Discard all git changes with `git checkout .`.
6. Copy the generated translations to their respective files, e.g.: `client/src/localization/languages/Es.ts`.