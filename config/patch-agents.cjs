const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_VERSION = '3.2.65';

function patchFile(filePath, patches) {
  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const { anchor, replacement } of patches) {
    if (source.includes(replacement)) {
      continue;
    }
    if (!source.includes(anchor)) {
      throw new Error(`Unable to patch ${filePath}: expected anchor was not found.`);
    }
    source = source.replaceAll(anchor, replacement);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, source);
  }
}

function patchAgents() {
  const entryPath = require.resolve('@librechat/agents');
  const packageRoot = path.resolve(path.dirname(entryPath), '..', '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

  if (packageJson.version !== SUPPORTED_VERSION) {
    throw new Error(
      `Unsupported @librechat/agents version ${packageJson.version}; expected ${SUPPORTED_VERSION}.`,
    );
  }

  for (const [format, extension] of Object.entries({ cjs: 'cjs', esm: 'mjs' })) {
    patchFile(path.join(packageRoot, 'dist', format, 'llm', 'google', `index.${extension}`), [
      {
        anchor: 'this.streaming = fields.streaming ?? this.streaming;',
        replacement:
          'this.streaming = fields.streaming ?? this.streaming;\n\t\tthis.disableStreaming = fields.disableStreaming ?? this.disableStreaming;',
      },
    ]);
    patchFile(path.join(packageRoot, 'dist', format, 'llm', 'vertexai', `index.${extension}`), [
      {
        anchor: 'this.thinkingConfig = fields?.thinkingConfig;',
        replacement:
          'this.thinkingConfig = fields?.thinkingConfig;\n\t\tthis.disableStreaming = fields?.disableStreaming ?? this.disableStreaming;',
      },
    ]);
    patchFile(path.join(packageRoot, 'dist', format, 'llm', 'openai', `index.${extension}`), [
      {
        anchor: 'this.includeReasoningContent = fields?.includeReasoningContent;',
        replacement:
          'this.includeReasoningContent = fields?.includeReasoningContent;\n\t\tthis.includeAllReasoningContent = fields?.includeAllReasoningContent;',
      },
      {
        anchor: 'includeReasoningContent: this.includeReasoningContent,',
        replacement:
          'includeReasoningContent: this.includeReasoningContent,\n\t\t\tincludeAllReasoningContent: this.includeAllReasoningContent,',
      },
    ]);
    patchFile(
      path.join(packageRoot, 'dist', format, 'llm', 'openai', 'utils', `index.${extension}`),
      [
        {
          anchor: '(hasReasoningToolCallContext || messageHasToolCalls)',
          replacement:
            '(options?.includeAllReasoningContent === true || hasReasoningToolCallContext || messageHasToolCalls)',
        },
      ],
    );
  }
}

patchAgents();
