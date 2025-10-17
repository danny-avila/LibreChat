/**
 * ESLint rule to enforce LibreChat import ordering conventions:
 * 1. npm packages first (longest to shortest)
 * 2. TypeScript types (longest to shortest, package types before local types)
 * 3. Local imports (longest to shortest, ~ alias treated same as relative)
 *
 * Auto-fixes import order violations.
 */

module.exports = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Enforce LibreChat import ordering conventions',
      category: 'Stylistic Issues',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      incorrectOrder:
        'Imports are not in the correct order. Expected: npm packages (longest to shortest), then type imports (longest to shortest), then local imports (longest to shortest).',
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * Determines if an import is a type import
     */
    function isTypeImport(node) {
      return (
        node.importKind === 'type' ||
        (node.specifiers && node.specifiers.some((spec) => spec.importKind === 'type'))
      );
    }

    /**
     * Determines if an import is a local import (relative or alias)
     */
    function isLocalImport(source) {
      return source.startsWith('.') || source.startsWith('~');
    }

    /**
     * Categorizes imports into groups
     * Returns: 'npm', 'type', or 'local'
     */
    function categorizeImport(node) {
      const source = node.source.value;
      const isType = isTypeImport(node);
      const isLocal = isLocalImport(source);

      if (isType) {
        return 'type';
      }
      if (isLocal) {
        return 'local';
      }
      return 'npm';
    }

    /**
     * Gets the line length for sorting purposes
     */
    function getLineLength(node) {
      const text = sourceCode.getText(node);
      return text.length;
    }

    /**
     * Checks if imports are in correct order
     */
    function checkImportOrder(imports) {
      const groupOrder = ['npm', 'type', 'local'];
      let currentGroupIndex = 0;

      const categorizedImports = imports.map((node) => ({
        node,
        category: categorizeImport(node),
        length: getLineLength(node),
      }));

      for (let i = 0; i < categorizedImports.length; i++) {
        const current = categorizedImports[i];
        const currentGroup = groupOrder.indexOf(current.category);

        // Check if we've moved to a new group
        if (currentGroup > currentGroupIndex) {
          currentGroupIndex = currentGroup;
        } else if (currentGroup < currentGroupIndex) {
          // Out of order: wrong group
          return false;
        }

        // Within the same group, check length order (longest to shortest)
        if (i > 0) {
          const previous = categorizedImports[i - 1];
          if (previous.category === current.category && previous.length < current.length) {
            return false;
          }
        }
      }

      return true;
    }

    /**
     * Sorts imports according to the convention
     */
    function sortImports(imports) {
      const categorizedImports = imports.map((node) => ({
        node,
        category: categorizeImport(node),
        length: getLineLength(node),
        text: sourceCode.getText(node),
      }));

      // Sort by category first, then by length (descending) within category
      const groupOrder = { npm: 0, type: 1, local: 2 };
      categorizedImports.sort((a, b) => {
        // First by group
        const groupDiff = groupOrder[a.category] - groupOrder[b.category];
        if (groupDiff !== 0) return groupDiff;

        // Then by length (longest first)
        return b.length - a.length;
      });

      return categorizedImports;
    }

    /**
     * Gets all import declarations in order
     */
    function getImportStatements(program) {
      const imports = [];
      for (const node of program.body) {
        if (node.type === 'ImportDeclaration') {
          imports.push(node);
        } else if (node.type !== 'ImportDeclaration' && imports.length > 0) {
          // Stop collecting once we hit a non-import statement
          break;
        }
      }
      return imports;
    }

    return {
      Program(node) {
        const imports = getImportStatements(node);

        if (imports.length < 2) {
          // No need to check if there's 0 or 1 import
          return;
        }

        if (!checkImportOrder(imports)) {
          context.report({
            node: imports[0],
            messageId: 'incorrectOrder',
            fix(fixer) {
              const sorted = sortImports(imports);

              // Get the range from the first import to the last import
              const firstImport = imports[0];
              const lastImport = imports[imports.length - 1];
              const rangeStart = firstImport.range[0];
              const rangeEnd = lastImport.range[1];

              // Build the replacement text with proper newlines
              const replacement = sorted.map((item) => item.text).join('\n');

              return fixer.replaceTextRange([rangeStart, rangeEnd], replacement);
            },
          });
        }
      },
    };
  },
};
