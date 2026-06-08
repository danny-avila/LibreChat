import {
  CONFIG_HTML_BLOCK_TAGS,
  CONFIG_HTML_CLASS_ATTR,
  CONFIG_HTML_INLINE_TAGS,
  createConfigHtmlSanitizer,
  sanitizeConfigHtml,
} from '../configHtml';

describe('configHtml', () => {
  it('removes active attributes and unsupported elements', () => {
    const sanitized = sanitizeConfigHtml(
      '<img src=x onerror="alert(1)"><a href="javascript:alert(1)" onclick="alert(1)"><strong>Learn</strong></a><script>alert(1)</script><svg onload="alert(1)"></svg>',
    );

    expect(sanitized).toBe(
      '<a target="_blank" rel="noopener noreferrer"><strong>Learn</strong></a>',
    );
  });

  it('keeps configured rich text tags and normalizes links', () => {
    const sanitize = createConfigHtmlSanitizer({
      allowedTags: CONFIG_HTML_BLOCK_TAGS,
      allowedAttr: CONFIG_HTML_CLASS_ATTR,
    });
    const sanitized = sanitize(
      '<p class="notice">Read <a href="https://example.com" target="_self"><strong>more</strong></a><br><code>safe</code></p>',
    );

    expect(sanitized).toBe(
      '<p class="notice">Read <a href="https://example.com" target="_blank" rel="noopener noreferrer"><strong>more</strong></a><br><code>safe</code></p>',
    );
  });

  it('keeps relative links but removes protocol-relative links', () => {
    const sanitize = createConfigHtmlSanitizer({
      allowedTags: CONFIG_HTML_INLINE_TAGS,
    });
    const sanitized = sanitize(
      '<a href="/docs">Docs</a> <a href="//example.com/remote">Remote</a>',
    );

    expect(sanitized).toBe(
      '<a href="/docs" target="_blank" rel="noopener noreferrer">Docs</a> <a target="_blank" rel="noopener noreferrer">Remote</a>',
    );
  });
});
