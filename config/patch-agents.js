#!/usr/bin/env node
/**
 * Postinstall script to patch @librechat/agents with truncation support
 * for OpenAI Responses API context compaction.
 *
 * This script is designed to not fail the build even if patching fails.
 */

try {
  const fs = require('fs');
  const path = require('path');

  // Try multiple possible locations for the package
  const possiblePaths = [
    'node_modules/@librechat/agents/dist/esm/llm/openai/index.mjs',
    'node_modules/@librechat/agents/dist/cjs/llm/openai/index.cjs',
    '../node_modules/@librechat/agents/dist/esm/llm/openai/index.mjs',
    '../node_modules/@librechat/agents/dist/cjs/llm/openai/index.cjs',
  ];

  function findAndPatchFiles() {
    let patchedCount = 0;

    for (const relativePath of possiblePaths) {
      try {
        const fullPath = path.resolve(process.cwd(), relativePath);

        if (!fs.existsSync(fullPath)) {
          continue;
        }

        let content = fs.readFileSync(fullPath, 'utf8');

        // Check if already patched
        if (content.includes('// PATCHED: truncation support')) {
          console.log(`[patch-agents] ${relativePath} already patched`);
          patchedCount++;
          continue;
        }

        let modified = false;

        // 1. Add truncation property after _lc_stream_delay
        if (!content.includes('truncation;')) {
          content = content.replace(
            /_lc_stream_delay;(\s*constructor)/g,
            '_lc_stream_delay;\n    truncation;$1'
          );
          modified = true;
        }

        // 2. Initialize truncation in constructors
        if (!content.includes('this.truncation = fields?.truncation')) {
          content = content.replace(
            /this\._lc_stream_delay = fields\?\.\_lc_stream_delay;(\s*\})/g,
            'this._lc_stream_delay = fields?._lc_stream_delay;\n        this.truncation = fields?.truncation ?? undefined;$1'
          );
          modified = true;
        }

        // 3. Add truncation to responseApiWithRetry calls
        if (!content.includes('this.truncation && { truncation: this.truncation }')) {
          content = content.replace(
            /stream: true,(\s*\},\s*options\s*\))/g,
            'stream: true,\n                ...(this.truncation && { truncation: this.truncation }),$1'
          );
          modified = true;
        }

        if (modified) {
          content = '// PATCHED: truncation support for OpenAI Responses API\n' + content;
          fs.writeFileSync(fullPath, content);
          console.log(`[patch-agents] Successfully patched ${relativePath}`);
          patchedCount++;
        } else {
          console.log(`[patch-agents] No changes needed for ${relativePath}`);
          patchedCount++;
        }
      } catch (err) {
        console.log(`[patch-agents] Could not patch ${relativePath}: ${err.message}`);
      }
    }

    return patchedCount;
  }

  console.log('[patch-agents] Attempting to patch @librechat/agents for truncation support...');
  const count = findAndPatchFiles();

  if (count > 0) {
    console.log(`[patch-agents] Patching complete! (${count} files processed)`);
  } else {
    console.log('[patch-agents] No files found to patch (this is OK if @librechat/agents is not installed yet)');
  }

} catch (error) {
  // Never fail the build due to patching issues
  console.log('[patch-agents] Patching skipped due to error:', error.message);
}

// Always exit successfully
process.exit(0);
