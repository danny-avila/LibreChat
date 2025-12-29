import { math } from './math';

describe('math', () => {
  describe('number input passthrough', () => {
    test('should return number as-is when input is a number', () => {
      expect(math(42)).toBe(42);
    });

    test('should return zero when input is 0', () => {
      expect(math(0)).toBe(0);
    });

    test('should return negative numbers as-is', () => {
      expect(math(-10)).toBe(-10);
    });

    test('should return decimal numbers as-is', () => {
      expect(math(0.5)).toBe(0.5);
    });

    test('should return very large numbers as-is', () => {
      expect(math(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('simple string number parsing', () => {
    test('should parse simple integer string', () => {
      expect(math('42')).toBe(42);
    });

    test('should parse zero string', () => {
      expect(math('0')).toBe(0);
    });

    test('should parse negative number string', () => {
      expect(math('-10')).toBe(-10);
    });

    test('should parse decimal string', () => {
      expect(math('0.5')).toBe(0.5);
    });

    test('should parse string with leading/trailing spaces', () => {
      expect(math('  42  ')).toBe(42);
    });

    test('should parse large number string', () => {
      expect(math('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('mathematical expressions - multiplication', () => {
    test('should evaluate simple multiplication', () => {
      expect(math('2 * 3')).toBe(6);
    });

    test('should evaluate chained multiplication (BAN_DURATION pattern: 1000 * 60 * 60 * 2)', () => {
      // 2 hours in milliseconds
      expect(math('1000 * 60 * 60 * 2')).toBe(7200000);
    });

    test('should evaluate SESSION_EXPIRY pattern (1000 * 60 * 15)', () => {
      // 15 minutes in milliseconds
      expect(math('1000 * 60 * 15')).toBe(900000);
    });

    test('should evaluate multiplication without spaces', () => {
      expect(math('2*3')).toBe(6);
    });
  });

  describe('mathematical expressions - addition and subtraction', () => {
    test('should evaluate simple addition', () => {
      expect(math('2 + 3')).toBe(5);
    });

    test('should evaluate simple subtraction', () => {
      expect(math('10 - 3')).toBe(7);
    });

    test('should evaluate mixed addition and subtraction', () => {
      expect(math('10 + 5 - 3')).toBe(12);
    });

    test('should handle negative results', () => {
      expect(math('3 - 10')).toBe(-7);
    });
  });

  describe('mathematical expressions - division', () => {
    test('should evaluate simple division', () => {
      expect(math('10 / 2')).toBe(5);
    });

    test('should evaluate division resulting in decimal', () => {
      expect(math('7 / 2')).toBe(3.5);
    });
  });

  describe('mathematical expressions - parentheses', () => {
    test('should evaluate expression with parentheses (REFRESH_TOKEN_EXPIRY pattern)', () => {
      // 7 days in milliseconds: (1000 * 60 * 60 * 24) * 7
      expect(math('(1000 * 60 * 60 * 24) * 7')).toBe(604800000);
    });

    test('should evaluate nested parentheses', () => {
      expect(math('((2 + 3) * 4)')).toBe(20);
    });

    test('should respect operator precedence with parentheses', () => {
      expect(math('2 * (3 + 4)')).toBe(14);
    });
  });

  describe('mathematical expressions - modulo', () => {
    test('should evaluate modulo operation', () => {
      expect(math('10 % 3')).toBe(1);
    });

    test('should evaluate modulo with larger numbers', () => {
      expect(math('100 % 7')).toBe(2);
    });
  });

  describe('complex real-world expressions', () => {
    test('should evaluate MCP_USER_CONNECTION_IDLE_TIMEOUT pattern (15 * 60 * 1000)', () => {
      // 15 minutes in milliseconds
      expect(math('15 * 60 * 1000')).toBe(900000);
    });

    test('should evaluate Redis default TTL (5000)', () => {
      expect(math('5000')).toBe(5000);
    });

    test('should evaluate LEADER_RENEW_RETRY_DELAY decimal (0.5)', () => {
      expect(math('0.5')).toBe(0.5);
    });

    test('should evaluate BAN_DURATION default (7200000)', () => {
      // 2 hours in milliseconds
      expect(math('7200000')).toBe(7200000);
    });

    test('should evaluate expression with mixed operators and parentheses', () => {
      // (1 hour + 30 min) in ms
      expect(math('(1000 * 60 * 60) + (1000 * 60 * 30)')).toBe(5400000);
    });
  });

  describe('fallback value behavior', () => {
    test('should return fallback when input is undefined', () => {
      expect(math(undefined, 100)).toBe(100);
    });

    test('should return fallback when input is null', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      expect(math(null, 100)).toBe(100);
    });

    test('should return fallback when input contains invalid characters', () => {
      expect(math('abc', 100)).toBe(100);
    });

    test('should return fallback when input has SQL injection attempt', () => {
      expect(math('1; DROP TABLE users;', 100)).toBe(100);
    });

    test('should return fallback when input has function call attempt', () => {
      expect(math('console.log("hacked")', 100)).toBe(100);
    });

    test('should return fallback when input is empty string', () => {
      expect(math('', 100)).toBe(100);
    });

    test('should return zero fallback when specified', () => {
      expect(math(undefined, 0)).toBe(0);
    });

    test('should use number input even when fallback is provided', () => {
      expect(math(42, 100)).toBe(42);
    });

    test('should use valid string even when fallback is provided', () => {
      expect(math('42', 100)).toBe(42);
    });
  });

  describe('error cases without fallback', () => {
    test('should throw error when input is undefined without fallback', () => {
      expect(() => math(undefined)).toThrow('str is undefined, but should be a string');
    });

    test('should throw error when input is null without fallback', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      expect(() => math(null)).toThrow('str is object, but should be a string');
    });

    test('should throw error when input contains invalid characters without fallback', () => {
      expect(() => math('abc')).toThrow('Invalid characters in string');
    });

    test('should throw error when input has letter characters', () => {
      expect(() => math('10x')).toThrow('Invalid characters in string');
    });

    test('should throw error when input has special characters', () => {
      expect(() => math('10!')).toThrow('Invalid characters in string');
    });

    test('should throw error for malicious code injection', () => {
      expect(() => math('process.exit(1)')).toThrow('Invalid characters in string');
    });

    test('should throw error for require injection', () => {
      expect(() => math('require("fs")')).toThrow('Invalid characters in string');
    });
  });

  describe('security - input validation', () => {
    test('should reject strings with alphabetic characters', () => {
      expect(() => math('Math.PI')).toThrow('Invalid characters in string');
    });

    test('should reject strings with brackets', () => {
      expect(() => math('[1,2,3]')).toThrow('Invalid characters in string');
    });

    test('should reject strings with curly braces', () => {
      expect(() => math('{}')).toThrow('Invalid characters in string');
    });

    test('should reject strings with semicolons', () => {
      expect(() => math('1;2')).toThrow('Invalid characters in string');
    });

    test('should reject strings with quotes', () => {
      expect(() => math('"test"')).toThrow('Invalid characters in string');
    });

    test('should reject strings with backticks', () => {
      expect(() => math('`test`')).toThrow('Invalid characters in string');
    });

    test('should reject strings with equals sign', () => {
      expect(() => math('x=1')).toThrow('Invalid characters in string');
    });

    test('should reject strings with ampersand', () => {
      expect(() => math('1 && 2')).toThrow('Invalid characters in string');
    });

    test('should reject strings with pipe', () => {
      expect(() => math('1 || 2')).toThrow('Invalid characters in string');
    });
  });

  describe('edge cases', () => {
    test('should handle expression resulting in Infinity with fallback', () => {
      // Division by zero returns Infinity, which is technically a number
      expect(math('1 / 0')).toBe(Infinity);
    });

    test('should handle very small decimals', () => {
      expect(math('0.001')).toBe(0.001);
    });

    test('should handle scientific notation format', () => {
      // Note: 'e' is not in the allowed character set, so this should fail
      expect(() => math('1e3')).toThrow('Invalid characters in string');
    });

    test('should handle expression with only whitespace with fallback', () => {
      expect(math('   ', 100)).toBe(100);
    });

    test('should handle +number syntax', () => {
      expect(math('+42')).toBe(42);
    });

    test('should handle expression starting with negative', () => {
      expect(math('-5 + 10')).toBe(5);
    });

    test('should handle multiple decimal points with fallback', () => {
      // Invalid syntax should return fallback value
      expect(math('1.2.3', 100)).toBe(100);
    });

    test('should throw for multiple decimal points without fallback', () => {
      expect(() => math('1.2.3')).toThrow();
    });
  });

  describe('type coercion edge cases', () => {
    test('should handle object input with fallback', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      expect(math({}, 100)).toBe(100);
    });

    test('should handle array input with fallback', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      expect(math([], 100)).toBe(100);
    });

    test('should handle boolean true with fallback', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      expect(math(true, 100)).toBe(100);
    });

    test('should handle boolean false with fallback', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      expect(math(false, 100)).toBe(100);
    });

    test('should throw for object input without fallback', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      expect(() => math({})).toThrow('str is object, but should be a string');
    });

    test('should throw for array input without fallback', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      expect(() => math([])).toThrow('str is object, but should be a string');
    });
  });
});
