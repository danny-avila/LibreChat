# Local ESLint Rules

This directory contains custom ESLint rules specific to the LibreChat project.

## Rules

### `import-order`

Enforces the LibreChat import ordering convention for TypeScript/JavaScript files.

**Import Order Convention:**

1. **npm packages** (longest line to shortest)
2. **TypeScript type imports** (longest line to shortest)
   - Package types come before local types
3. **Local imports** (longest line to shortest)
   - Imports with `~` alias are treated the same as relative imports (`./`, `../`) for length calculation

**Examples:**

```typescript
// ✅ Correct order
import ReactMarkdown from 'react-markdown';
import { useRecoilValue } from 'recoil';
import React from 'react';
import type { SomeVeryLongTypeName } from 'package-name';
import type { LocalType } from './types';
import { veryLongFunctionName } from '~/utils/helpers';
import { shortFunc } from './utils';

// ❌ Incorrect order (will be flagged)
import React from 'react';
import { shortFunc } from './utils';
import type { LocalType } from './types';
import ReactMarkdown from 'react-markdown';
```

**Usage:**

The rule is configured as an error in `eslint.config.mjs` and supports auto-fix:

```bash
# Check for violations
npx eslint path/to/file.ts

# Auto-fix violations
npx eslint path/to/file.ts --fix
```

**Configuration:**

The rule is enabled in [eslint.config.mjs](../eslint.config.mjs:147):

```javascript
rules: {
  'local/import-order': 'error',
}
```

## Adding New Rules

To add a new local rule:

1. Create a new file in this directory (e.g., `my-rule.js`)
2. Export an ESLint rule object with `meta` and `create` properties
3. Add the rule to `index.js`:
   ```javascript
   module.exports = {
     rules: {
       'import-order': require('./import-order'),
       'my-rule': require('./my-rule'),
     },
   };
   ```
4. Enable the rule in `eslint.config.mjs`:
   ```javascript
   rules: {
     'local/my-rule': 'error',
   }
   ```

## References

- [ESLint Rule Development Guide](https://eslint.org/docs/latest/extend/custom-rules)
- [AST Explorer](https://astexplorer.net/) - for understanding JavaScript/TypeScript AST structure
