import { defaultAppTitle, defaultAppDescription } from 'librechat-data-provider';
import { getAppMetadata, transformIndexHtml, transformManifest } from './appMetadata';

const sampleHtml = `<!DOCTYPE html>
<html lang="en-US">
  <head>
    <meta name="description" content="${defaultAppDescription}" />
    <title>${defaultAppTitle}</title>
  </head>
  <body></body>
</html>`;

describe('getAppMetadata', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APP_TITLE;
    delete process.env.APP_DESCRIPTION;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns defaults when env vars are not set', () => {
    const metadata = getAppMetadata();
    expect(metadata.title).toBe(defaultAppTitle);
    expect(metadata.description).toBe(defaultAppDescription);
  });

  it('reads APP_TITLE from env', () => {
    process.env.APP_TITLE = 'My Custom App';
    const metadata = getAppMetadata();
    expect(metadata.title).toBe('My Custom App');
    expect(metadata.description).toBe(defaultAppDescription);
  });

  it('reads APP_DESCRIPTION from env', () => {
    process.env.APP_DESCRIPTION = 'A custom description';
    const metadata = getAppMetadata();
    expect(metadata.title).toBe(defaultAppTitle);
    expect(metadata.description).toBe('A custom description');
  });
});

describe('transformIndexHtml', () => {
  it('returns HTML unchanged when metadata matches defaults', () => {
    const result = transformIndexHtml(sampleHtml, {
      title: defaultAppTitle,
      description: defaultAppDescription,
    });
    expect(result).toBe(sampleHtml);
  });

  it('replaces the title tag with custom title', () => {
    const result = transformIndexHtml(sampleHtml, {
      title: 'My App',
      description: defaultAppDescription,
    });
    expect(result).toContain('<title>My App</title>');
    expect(result).not.toContain(`<title>${defaultAppTitle}</title>`);
  });

  it('replaces the meta description with custom description', () => {
    const result = transformIndexHtml(sampleHtml, {
      title: defaultAppTitle,
      description: 'Custom description here',
    });
    expect(result).toContain('content="Custom description here"');
    expect(result).not.toContain(`content="${defaultAppDescription}"`);
  });

  it('replaces both title and description simultaneously', () => {
    const result = transformIndexHtml(sampleHtml, {
      title: 'My App',
      description: 'My description',
    });
    expect(result).toContain('<title>My App</title>');
    expect(result).toContain('content="My description"');
  });

  it('escapes HTML special characters in title', () => {
    const result = transformIndexHtml(sampleHtml, {
      title: 'App <script>alert("xss")</script>',
      description: defaultAppDescription,
    });
    expect(result).toContain(
      '<title>App &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</title>',
    );
    expect(result).not.toContain('<script>alert');
  });

  it('escapes HTML special characters in description', () => {
    const result = transformIndexHtml(sampleHtml, {
      title: defaultAppTitle,
      description: 'Desc with "quotes" & <tags>',
    });
    expect(result).toContain('content="Desc with &quot;quotes&quot; &amp; &lt;tags&gt;"');
  });
});

describe('transformManifest', () => {
  const sampleManifest = {
    name: 'LibreChat',
    short_name: 'LibreChat',
    description: '',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#009688',
    icons: [{ src: 'icon.png', sizes: '192x192' }],
  };

  it('replaces name, short_name, and description', () => {
    const result = transformManifest(sampleManifest, {
      title: 'My App',
      description: 'My description',
    });
    expect(result.name).toBe('My App');
    expect(result.short_name).toBe('My App');
    expect(result.description).toBe('My description');
  });

  it('preserves other manifest fields', () => {
    const result = transformManifest(sampleManifest, {
      title: 'My App',
      description: 'My description',
    });
    expect(result.display).toBe('standalone');
    expect(result.background_color).toBe('#000000');
    expect(result.theme_color).toBe('#009688');
    expect(result.icons).toEqual([{ src: 'icon.png', sizes: '192x192' }]);
  });

  it('works with default values', () => {
    const result = transformManifest(sampleManifest, {
      title: defaultAppTitle,
      description: defaultAppDescription,
    });
    expect(result.name).toBe(defaultAppTitle);
    expect(result.short_name).toBe(defaultAppTitle);
    expect(result.description).toBe(defaultAppDescription);
  });
});
