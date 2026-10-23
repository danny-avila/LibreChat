const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createDocumentExtractor, extractionText } = require('/test/client.cjs');

async function main() {
  const client = createDocumentExtractor({ enabled: true });
  for (const [name, format] of [
    ['pages.pdf', 'pdf'],
    ['body.docx', 'docx'],
  ]) {
    const bytes = fs.readFileSync(`/fixtures/${name}`);
    const result = await client.extract(bytes, format);
    assert.equal(result.format, format);
    assert.equal(result.segments[0].index, 1);
    assert.ok(extractionText(result).trim());
    assert.equal(
      result.textBytes,
      result.segments.reduce((size, segment) => size + Buffer.byteLength(segment.text), 0),
    );
    if (format === 'pdf') {
      assert.equal(result.segments.length, 2);
      assert.deepEqual(
        result.segments.map((segment) => segment.text),
        ['First page text', 'Second page text'],
      );
      assert.ok(result.segments.every((segment) => segment.kind === 'page'));
    } else {
      assert.equal(result.segments.length, 1);
      assert.equal(result.segments[0].kind, 'document');
      assert.equal(
        result.segments[0].text,
        'First paragraph\nLeft cell\tRight cell\nLast paragraph\n',
      );
    }
    console.log(`Real client -> hardened processor: ${format} passed`);
  }
  await assert.rejects(
    client.extract(Buffer.from('not a PDF'), 'pdf'),
    (error) => error.code === 'INVALID_DOCUMENT',
  );
  console.log('Real processor rejection remains a safe client failure');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
