import {
  validateAndSanitizeURL,
  sanitizeHTML,
  sanitizeWidgetCode,
  sanitizeChartData,
  XSSPrevention,
} from '../utils/SecurityUtils';

// Mock DOM APIs
Object.defineProperty(global, 'document', {
  value: {
    createElement: jest.fn(() => ({
      textContent: '',
      innerHTML: '',
    })),
  },
  writable: true,
});

// Mock URL constructor for Node.js environment
global.URL = global.URL || class URL {
  protocol: string;
  hostname: string;
  pathname: string;
  searchParams: URLSearchParams;

  constructor(url: string) {
    // Simple URL parsing for tests
    const match = url.match(/^(https?:)\/\/([^\/]+)(\/[^?]*)?(\?.*)?$/);
    if (!match) {
      throw new Error('Invalid URL');
    }
    
    this.protocol = match[1];
    this.hostname = match[2];
    this.pathname = match[3] || '/';
    this.searchParams = new URLSearchParams(match[4] || '');
  }

  toString() {
    const query = this.searchParams.toString();
    return `${this.protocol}//${this.hostname}${this.pathname}${query ? '?' + query : ''}`;
  }
};

global.URLSearchParams = global.URLSearchParams || class URLSearchParams {
  private params: Map<string, string> = new Map();

  constructor(search?: string) {
    if (search) {
      const pairs = search.replace(/^\?/, '').split('&');
      pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key) this.params.set(key, value || '');
      });
    }
  }

  delete(name: string) {
    this.params.delete(name);
  }

  toString() {
    const pairs: string[] = [];
    this.params.forEach((value, key) => {
      pairs.push(`${key}=${value}`);
    });
    return pairs.join('&');
  }
};

describe('SecurityUtils', () => {
  describe('validateAndSanitizeURL', () => {
    it('should validate valid HTTPS URLs', () => {
      const result = validateAndSanitizeURL('https://example.com/image.jpg');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://example.com/image.jpg');
      expect(result.mediaType).toBe('image');
    });

    it('should validate valid HTTP URLs', () => {
      const result = validateAndSanitizeURL('http://example.com/video.mp4');
      expect(result.isValid).toBe(true);
      expect(result.mediaType).toBe('video');
    });

    it('should reject data URLs', () => {
      const result = validateAndSanitizeURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Data URLs and JavaScript URLs are not allowed');
    });

    it('should reject javascript URLs', () => {
      const result = validateAndSanitizeURL('javascript:alert("xss")');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Data URLs and JavaScript URLs are not allowed');
    });

    it('should reject unsupported protocols', () => {
      const result = validateAndSanitizeURL('ftp://example.com/file.txt');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Protocol ftp: is not allowed');
    });

    it('should remove dangerous query parameters', () => {
      const result = validateAndSanitizeURL('https://example.com/image.jpg?callback=evil&normal=ok');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).not.toContain('callback=evil');
      expect(result.sanitizedUrl).toContain('normal=ok');
    });

    it('should handle invalid URLs', () => {
      const result = validateAndSanitizeURL('not-a-url');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid URL format');
    });

    it('should detect media types correctly', () => {
      const imageResult = validateAndSanitizeURL('https://example.com/test.png');
      expect(imageResult.mediaType).toBe('image');

      const videoResult = validateAndSanitizeURL('https://example.com/test.mp4');
      expect(videoResult.mediaType).toBe('video');

      const audioResult = validateAndSanitizeURL('https://example.com/test.mp3');
      expect(audioResult.mediaType).toBe('audio');
    });
  });

  describe('sanitizeHTML', () => {
    beforeEach(() => {
      // Mock document.createElement to return a proper element mock
      (document.createElement as jest.Mock).mockReturnValue({
        textContent: '',
        innerHTML: '',
        set textContent(value: string) {
          // Simulate HTML escaping
          this.innerHTML = value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
        },
        get innerHTML() {
          return this._innerHTML || '';
        },
        set innerHTML(value: string) {
          this._innerHTML = value;
        },
      });
    });

    it('should escape HTML entities', () => {
      const result = sanitizeHTML('<script>alert("xss")</script>');
      expect(result).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    it('should handle special characters', () => {
      const result = sanitizeHTML('Test & "quotes" and \'apostrophes\'');
      expect(result).toBe('Test &amp; "quotes" and &#x27;apostrophes&#x27;');
    });
  });

  describe('sanitizeWidgetCode', () => {
    describe('React code sanitization', () => {
      it('should remove dangerouslySetInnerHTML', () => {
        const code = 'const Component = () => <div dangerouslySetInnerHTML={{__html: userInput}} />';
        const result = sanitizeWidgetCode(code, 'react');
        expect(result).toContain('/* REMOVED FOR SECURITY */');
        expect(result).not.toContain('dangerouslySetInnerHTML');
      });

      it('should remove eval calls', () => {
        const code = 'const result = eval("malicious code");';
        const result = sanitizeWidgetCode(code, 'react');
        expect(result).toContain('/* REMOVED FOR SECURITY */');
        expect(result).not.toContain('eval(');
      });

      it('should remove Function constructor', () => {
        const code = 'const fn = new Function("return malicious");';
        const result = sanitizeWidgetCode(code, 'react');
        expect(result).toContain('/* REMOVED FOR SECURITY */');
        expect(result).not.toContain('Function(');
      });

      it('should remove setTimeout and setInterval', () => {
        const code = 'setTimeout(() => malicious(), 1000);';
        const result = sanitizeWidgetCode(code, 'react');
        expect(result).toContain('/* REMOVED FOR SECURITY */');
        expect(result).not.toContain('setTimeout(');
      });

      it('should remove DOM access', () => {
        const code = 'document.getElementById("test").innerHTML = userInput;';
        const result = sanitizeWidgetCode(code, 'react');
        expect(result).toContain('/* REMOVED FOR SECURITY */');
        expect(result).not.toContain('document.');
      });

      it('should remove window access', () => {
        const code = 'window.location = "http://evil.com";';
        const result = sanitizeWidgetCode(code, 'react');
        expect(result).toContain('/* REMOVED FOR SECURITY */');
        expect(result).not.toContain('window.');
      });

      it('should remove require calls', () => {
        const code = 'const fs = require("fs");';
        const result = sanitizeWidgetCode(code, 'react');
        expect(result).toContain('/* REMOVED FOR SECURITY */');
        expect(result).not.toContain('require(');
      });

      it('should remove import statements', () => {
        const code = 'import fs from "fs";';
        const result = sanitizeWidgetCode(code, 'react');
        expect(result).toContain('/* REMOVED FOR SECURITY */');
        expect(result).not.toContain('import fs from');
      });
    });

    describe('HTML code sanitization', () => {
      it('should remove script tags', () => {
        const code = '<div>Safe content</div><script>alert("xss")</script>';
        const result = sanitizeWidgetCode(code, 'html');
        expect(result).toContain('<!-- REMOVED FOR SECURITY -->');
        expect(result).not.toContain('<script>');
        expect(result).toContain('<div>Safe content</div>');
      });

      it('should remove iframe tags', () => {
        const code = '<iframe src="http://evil.com"></iframe>';
        const result = sanitizeWidgetCode(code, 'html');
        expect(result).toContain('<!-- REMOVED FOR SECURITY -->');
        expect(result).not.toContain('<iframe');
      });

      it('should remove object and embed tags', () => {
        const code = '<object data="evil.swf"></object><embed src="evil.swf">';
        const result = sanitizeWidgetCode(code, 'html');
        expect(result).toContain('<!-- REMOVED FOR SECURITY -->');
        expect(result).not.toContain('<object');
        expect(result).not.toContain('<embed');
      });

      it('should remove form tags', () => {
        const code = '<form action="http://evil.com"><input type="text"></form>';
        const result = sanitizeWidgetCode(code, 'html');
        expect(result).toContain('<!-- REMOVED FOR SECURITY -->');
        expect(result).not.toContain('<form');
      });

      it('should remove event handlers', () => {
        const code = '<div onclick="alert(\'xss\')" onload="malicious()">Content</div>';
        const result = sanitizeWidgetCode(code, 'html');
        expect(result).toContain('<!-- REMOVED FOR SECURITY -->');
        expect(result).not.toContain('onclick=');
        expect(result).not.toContain('onload=');
      });

      it('should remove javascript: URLs', () => {
        const code = '<a href="javascript:alert(\'xss\')">Link</a>';
        const result = sanitizeWidgetCode(code, 'html');
        expect(result).toContain('<!-- REMOVED FOR SECURITY -->');
        expect(result).not.toContain('javascript:');
      });

      it('should remove data: URLs', () => {
        const code = '<img src="data:text/html,<script>alert(\'xss\')</script>">';
        const result = sanitizeWidgetCode(code, 'html');
        expect(result).toContain('<!-- REMOVED FOR SECURITY -->');
        expect(result).not.toContain('data:');
      });
    });
  });

  describe('sanitizeChartData', () => {
    it('should validate and sanitize URLs', () => {
      const result = sanitizeChartData('https://example.com/data.csv');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedData).toBe('https://example.com/data.csv');
    });

    it('should reject invalid URLs', () => {
      const result = sanitizeChartData('javascript:alert("xss")');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Data URLs and JavaScript URLs are not allowed');
    });

    it('should sanitize JSON data', () => {
      const jsonData = '{"labels": ["A", "B"], "data": [1, 2]}';
      const result = sanitizeChartData(jsonData);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedData).toBe(jsonData);
    });

    it('should remove functions from JSON', () => {
      const jsonData = '{"labels": ["A"], "callback": "function() { alert(\\"xss\\"); }"}';
      const result = sanitizeChartData(jsonData);
      expect(result.isValid).toBe(true);
      const parsed = JSON.parse(result.sanitizedData!);
      expect(parsed.callback).toBeNull();
    });

    it('should sanitize CSV data', () => {
      const csvData = 'Name,Value\nTest,123\n<script>alert("xss")</script>,456';
      const result = sanitizeChartData(csvData);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedData).not.toContain('<script>');
    });

    it('should handle invalid JSON', () => {
      const result = sanitizeChartData('{"invalid": json}');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid data format');
    });
  });

  describe('XSSPrevention', () => {
    describe('escapeHTML', () => {
      beforeEach(() => {
        // Mock document.createElement for XSSPrevention.escapeHTML
        (document.createElement as jest.Mock).mockReturnValue({
          textContent: '',
          innerHTML: '',
          set textContent(value: string) {
            // Simulate HTML escaping
            this.innerHTML = value
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#x27;');
          },
          get innerHTML() {
            return this._innerHTML || '';
          },
          set innerHTML(value: string) {
            this._innerHTML = value;
          },
        });
      });

      it('should escape HTML entities', () => {
        const result = XSSPrevention.escapeHTML('<script>alert("xss")</script>');
        expect(result).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
      });

      it('should escape quotes and ampersands', () => {
        const result = XSSPrevention.escapeHTML('Test & "quotes" and \'apostrophes\'');
        expect(result).toBe('Test &amp; "quotes" and &#x27;apostrophes&#x27;');
      });
    });

    describe('removeScripts', () => {
      it('should remove script tags', () => {
        const html = '<div>Safe</div><script>alert("xss")</script><p>More safe</p>';
        const result = XSSPrevention.removeScripts(html);
        expect(result).toBe('<div>Safe</div><p>More safe</p>');
      });

      it('should remove event handlers', () => {
        const html = '<div onclick="alert(\'xss\')" onload="malicious()">Content</div>';
        const result = XSSPrevention.removeScripts(html);
        expect(result).toBe('<div>Content</div>');
      });

      it('should remove javascript: URLs', () => {
        const html = '<a href="javascript:alert(\'xss\')">Link</a>';
        const result = XSSPrevention.removeScripts(html);
        expect(result).toBe('<a href="">Link</a>');
      });
    });

    describe('validateContent', () => {
      it('should detect script tags', () => {
        const result = XSSPrevention.validateContent('<script>alert("xss")</script>');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
      });

      it('should detect javascript: URLs', () => {
        const result = XSSPrevention.validateContent('javascript:alert("xss")');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
      });

      it('should detect event handlers', () => {
        const result = XSSPrevention.validateContent('<div onclick="alert()">');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
      });

      it('should detect eval calls', () => {
        const result = XSSPrevention.validateContent('eval("malicious")');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
      });

      it('should detect Function constructor', () => {
        const result = XSSPrevention.validateContent('new Function("malicious")');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
      });

      it('should allow safe content', () => {
        const result = XSSPrevention.validateContent('<div>Safe content</div>');
        expect(result.isValid).toBe(true);
      });
    });
  });
});