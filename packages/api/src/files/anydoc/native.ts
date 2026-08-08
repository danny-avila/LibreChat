import { runNativeParserChild } from '../documents/nativeProcess';

const ANYDOC_CHILD_TIMEOUT_MS = 30_000;

const CHILD_SOURCE = `
process.once('message', async (request) => {
  const fs = require('fs');
  try {
    const anydoc = require(request.modulePath);
    const data = fs.readFileSync(request.path);
    const markdown = await anydoc.toMarkdownBytes(new Uint8Array(data), request.format);
    process.send({ ok: true, result: markdown });
  } catch (error) {
    process.send({ ok: false, message: error && error.message ? error.message : String(error) });
  }
});
`;

/** Parse an AnyDoc-supported document outside the API process. */
export function extractMarkdownIsolated(filePath: string, format: string | null): Promise<string> {
  return runNativeParserChild<string>({
    childSource: CHILD_SOURCE,
    parserName: 'anydoc',
    request: {
      path: filePath,
      format,
      modulePath: require.resolve('@firecrawl/anydoc'),
    },
    timeoutMs: ANYDOC_CHILD_TIMEOUT_MS,
  });
}
