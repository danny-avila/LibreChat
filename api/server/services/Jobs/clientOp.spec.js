const { parseClientOp } = require('./clientOp');

describe('Jobs clientOp parser', () => {
  it('parses a readFile operation', () => {
    expect(
      parseClientOp('Need the file first.\nCLIENT_OP: {"op":"readFile","path":"notes.txt"}'),
    ).toEqual({
      op: 'readFile',
      path: 'notes.txt',
      content: undefined,
      contentRef: undefined,
    });
  });

  it('parses listDir with an empty path as the connected root', () => {
    expect(parseClientOp('CLIENT_OP: {"op":"listDir"}')).toEqual({
      op: 'listDir',
      path: '',
      content: undefined,
      contentRef: undefined,
    });
    expect(parseClientOp('CLIENT_OP: {"op":"listDir","path":"."}')).toEqual({
      op: 'listDir',
      path: '',
      content: undefined,
      contentRef: undefined,
    });
  });

  it('parses writeFile with inline content', () => {
    expect(
      parseClientOp('CLIENT_OP: {"op":"writeFile","path":"out.txt","content":"hello"}'),
    ).toEqual({
      op: 'writeFile',
      path: 'out.txt',
      content: 'hello',
      contentRef: undefined,
    });
  });

  it('rejects invalid operations', () => {
    expect(parseClientOp('CLIENT_OP: {"op":"deleteFile","path":"x"}')).toBeNull();
    expect(parseClientOp('CLIENT_OP: not-json')).toBeNull();
    expect(parseClientOp('No client op here.\nSTATUS: CONTINUE')).toBeNull();
  });
});
