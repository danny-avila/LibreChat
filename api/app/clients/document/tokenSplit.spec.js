// Override the global Jest timeout for this specific test file, otherwise:
// FAIL app/clients/document/tokenSplit.spec.js (113.473 s)
// thrown: "Exceeded timeout of 30000 ms for a test.
jest.setTimeout(120000);

const tokenSplit = require('./tokenSplit');

describe('tokenSplit', () => {
  const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam id.';

  it('returns correct text chunks with provided parameters', async () => {
    const result = await tokenSplit({
      text: text,
      encodingName: 'gpt2',
      chunkSize: 2,
      chunkOverlap: 1,
      returnSize: 5,
    });

    expect(result).toEqual(['it.', '. Null', ' Nullam', 'am id', ' id.']);
  });

  it('returns correct text chunks with default parameters', async () => {
    const result = await tokenSplit({ text });
    expect(result).toEqual([
      'Lorem',
      ' ipsum',
      ' dolor',
      ' sit',
      ' amet',
      ',',
      ' consectetur',
      ' adipiscing',
      ' elit',
      '.',
      ' Null',
      'am',
      ' id',
      '.',
    ]);
  });

  it('returns correct text chunks with specific return size', async () => {
    const result = await tokenSplit({ text, returnSize: 2 });
    expect(result.length).toEqual(2);
    expect(result).toEqual([' id', '.']);
  });

  it('returns correct text chunks with specified chunk size', async () => {
    const result = await tokenSplit({ text, chunkSize: 10 });
    expect(result).toEqual([
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      ' Nullam id.',
    ]);
  });

  it('returns empty array with no text', async () => {
    const result = await tokenSplit({ text: '' });
    expect(result).toEqual([]);
  });
});
