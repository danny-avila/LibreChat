import parseJsonField from '../parseJsonField';

describe('parseJsonField', () => {
  describe('object args', () => {
    it('returns the field value when present', () => {
      expect(parseJsonField({ skillName: 'mySkill' }, 'skillName')).toBe('mySkill');
    });

    it('returns empty string when field is missing', () => {
      expect(parseJsonField({ other: 'value' }, 'skillName')).toBe('');
    });

    it('returns empty string when field is null', () => {
      expect(parseJsonField({ skillName: null }, 'skillName')).toBe('');
    });

    it('coerces numeric field values to string', () => {
      expect(parseJsonField({ count: 42 }, 'count')).toBe('42');
    });

    it('handles different field names — file_path', () => {
      expect(parseJsonField({ file_path: '/home/user/file.ts' }, 'file_path')).toBe(
        '/home/user/file.ts',
      );
    });

    it('handles different field names — command', () => {
      expect(parseJsonField({ command: 'ls -la' }, 'command')).toBe('ls -la');
    });
  });

  describe('undefined args', () => {
    it('returns empty string for undefined', () => {
      expect(parseJsonField(undefined, 'skillName')).toBe('');
    });
  });

  describe('valid JSON string args', () => {
    it('returns the field value when present', () => {
      expect(parseJsonField('{"skillName":"mySkill"}', 'skillName')).toBe('mySkill');
    });

    it('returns empty string when field is missing from parsed JSON', () => {
      expect(parseJsonField('{"other":"value"}', 'skillName')).toBe('');
    });

    it('handles different field names — file_path', () => {
      expect(parseJsonField('{"file_path":"/tmp/out.txt"}', 'file_path')).toBe('/tmp/out.txt');
    });

    it('handles different field names — command', () => {
      expect(parseJsonField('{"command":"echo hello"}', 'command')).toBe('echo hello');
    });
  });

  describe('empty string args', () => {
    it('returns empty string for empty string input', () => {
      expect(parseJsonField('', 'skillName')).toBe('');
    });
  });

  describe('partial/streaming JSON — regex fallback', () => {
    it('extracts field from malformed partial JSON', () => {
      const partial = '{"skillName":"mySkill","incomplete":';
      expect(parseJsonField(partial, 'skillName')).toBe('mySkill');
    });

    it('returns empty string when field is absent from partial JSON', () => {
      const partial = '{"other":"value","incomplete":';
      expect(parseJsonField(partial, 'skillName')).toBe('');
    });

    it('unescapes \\n in regex-matched values', () => {
      const partial = '{"command":"line1\\nline2","incomplete":';
      expect(parseJsonField(partial, 'command')).toBe('line1\nline2');
    });

    it('unescapes \\" in regex-matched values', () => {
      const partial = '{"command":"say \\"hello\\"","incomplete":';
      expect(parseJsonField(partial, 'command')).toBe('say "hello"');
    });

    it('unescapes \\\\ in regex-matched values', () => {
      const partial = '{"file_path":"C:\\\\Users\\\\file.txt","incomplete":';
      expect(parseJsonField(partial, 'file_path')).toBe('C:\\Users\\file.txt');
    });

    it('handles whitespace between colon and value', () => {
      const partial = '{"skillName" :  "spaced","incomplete":';
      expect(parseJsonField(partial, 'skillName')).toBe('spaced');
    });

    it('decodes \\\\n as literal backslash + n, not newline', () => {
      const partial = '{"file_path":"C:\\\\note","incomplete":';
      expect(parseJsonField(partial, 'file_path')).toBe('C:\\note');
    });

    it('preserves unknown escape sequences', () => {
      const partial = '{"command":"tab\\there","incomplete":';
      expect(parseJsonField(partial, 'command')).toBe('tab\\there');
    });
  });
});
