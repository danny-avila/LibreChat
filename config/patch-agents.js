/**
 * Postinstall script to patch @librechat/agents with truncation support
 * for OpenAI Responses API context compaction.
 */

const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'node_modules/@librechat/agents/dist/esm/llm/openai/index.mjs',
  'node_modules/@librechat/agents/dist/cjs/llm/openai/index.cjs',
];

// Pattern to find the ChatOpenAI class constructor and add truncation property
const patches = [
  {
    // Add truncation property to ChatOpenAI class
    find: /class ChatOpenAI extends OriginalChatOpenAI \{[\s\S]*?_lc_stream_delay;/,
    replace: (match) => match.replace(
      '_lc_stream_delay;',
      '_lc_stream_delay;\n    truncation;'
    ),
  },
  {
    // Initialize truncation in ChatOpenAI constructor
    find: /this\._lc_stream_delay = fields\?\.\_lc_stream_delay;(\s*}\s*get exposedClient)/,
    replace: 'this._lc_stream_delay = fields?._lc_stream_delay;\n        this.truncation = fields?.truncation ?? undefined;$1',
  },
  {
    // Add truncation to responseApiWithRetry call in ChatOpenAI
    find: /(stream: true,)(\s*},\s*options\s*\);[\s\S]*?for await \(const data of streamIterable\)[\s\S]*?_convertOpenAIResponsesDeltaToBaseMessageChunk)/,
    replace: (match, streamTrue, rest) => {
      // Only patch if not already patched
      if (match.includes('this.truncation')) return match;
      return streamTrue + '\n                ...(this.truncation && { truncation: this.truncation }),' + rest;
    },
  },
  {
    // Add truncation property to AzureChatOpenAI class
    find: /class AzureChatOpenAI extends OriginalAzureChatOpenAI \{[\s\S]*?_lc_stream_delay;/,
    replace: (match) => {
      if (match.includes('truncation;')) return match;
      return match.replace(
        '_lc_stream_delay;',
        '_lc_stream_delay;\n    truncation;'
      );
    },
  },
  {
    // Initialize truncation in AzureChatOpenAI constructor
    find: /(class AzureChatOpenAI[\s\S]*?)this\._lc_stream_delay = fields\?\.\_lc_stream_delay;(\s*}\s*get exposedClient)/,
    replace: (match, before, after) => {
      if (match.includes('this.truncation =')) return match;
      return before + 'this._lc_stream_delay = fields?._lc_stream_delay;\n        this.truncation = fields?.truncation ?? undefined;' + after;
    },
  },
];

function patchFile(filePath) {
  const fullPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`[patch-agents] Skipping ${filePath} - file not found`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let patched = false;

  // Check if already patched
  if (content.includes('// PATCHED: truncation support')) {
    console.log(`[patch-agents] ${filePath} already patched`);
    return true;
  }

  // Simple approach: just add truncation to the class and responseApiWithRetry calls

  // 1. Add truncation property after _lc_stream_delay in ChatOpenAI
  if (!content.includes('truncation;') || content.split('truncation;').length < 3) {
    content = content.replace(
      /_lc_stream_delay;(\s*constructor)/g,
      '_lc_stream_delay;\n    truncation;$1'
    );
    patched = true;
  }

  // 2. Initialize truncation in constructors (after _lc_stream_delay assignment)
  const constructorPattern = /this\._lc_stream_delay = fields\?\.\_lc_stream_delay;(\s*\})/g;
  if (!content.includes('this.truncation = fields?.truncation')) {
    content = content.replace(
      constructorPattern,
      'this._lc_stream_delay = fields?._lc_stream_delay;\n        this.truncation = fields?.truncation ?? undefined;$1'
    );
    patched = true;
  }

  // 3. Add truncation to responseApiWithRetry calls (after stream: true)
  // Be careful to only patch the right places
  if (!content.includes('...(this.truncation && { truncation: this.truncation })')) {
    // Find all instances of "stream: true," followed by closing brace and options
    content = content.replace(
      /stream: true,(\s*\},\s*options\s*\))/g,
      'stream: true,\n                ...(this.truncation && { truncation: this.truncation }),$1'
    );
    patched = true;
  }

  if (patched) {
    // Add marker comment at the top
    content = '// PATCHED: truncation support for OpenAI Responses API\n' + content;
    fs.writeFileSync(fullPath, content);
    console.log(`[patch-agents] Successfully patched ${filePath}`);
    return true;
  }

  console.log(`[patch-agents] No changes needed for ${filePath}`);
  return true;
}

console.log('[patch-agents] Patching @librechat/agents for truncation support...');

let success = true;
for (const file of filesToPatch) {
  try {
    patchFile(file);
  } catch (error) {
    console.error(`[patch-agents] Error patching ${file}:`, error.message);
    success = false;
  }
}

if (success) {
  console.log('[patch-agents] Patching complete!');
} else {
  console.error('[patch-agents] Some patches failed, but continuing...');
}
