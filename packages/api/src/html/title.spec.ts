import fs from 'fs';
import path from 'path';
import { applyAppTitle } from './title';

const SHELL =
  '<!DOCTYPE html><html><head><title>LibreChat</title></head>' +
  '<body><div id="root"></div></body></html>';

const titleOf = (html: string): string | undefined => /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1];

describe('applyAppTitle', () => {
  it('writes the deployment title into the shell', () => {
    expect(titleOf(applyAppTitle(SHELL, 'Beispiel GmbH KI'))).toBe('Beispiel GmbH KI');
  });

  it('leaves the shell untouched when unset, blank or not a string', () => {
    expect(applyAppTitle(SHELL, undefined)).toBe(SHELL);
    expect(applyAppTitle(SHELL, null)).toBe(SHELL);
    expect(applyAppTitle(SHELL, '')).toBe(SHELL);
    expect(applyAppTitle(SHELL, '   ')).toBe(SHELL);
    expect(applyAppTitle(SHELL, 42 as unknown as string)).toBe(SHELL);
  });

  it('trims surrounding whitespace', () => {
    expect(titleOf(applyAppTitle(SHELL, '  Beispiel GmbH  '))).toBe('Beispiel GmbH');
  });

  it('escapes a title that would otherwise close the element or inject markup', () => {
    const html = applyAppTitle(SHELL, '</title><script>alert(1)</script>');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;/title&gt;');
  });

  it('treats replacement patterns in the title as data', () => {
    expect(titleOf(applyAppTitle(SHELL, 'A $& B $1 C'))).toBe('A $&amp; B $1 C');
  });

  it('replaces only the title and nothing else in the document', () => {
    const html = applyAppTitle(SHELL, 'Beispiel');

    expect(html).toContain('<div id="root"></div>');
    expect(html.match(/<title>/gi)).toHaveLength(1);
  });

  it('leaves a shell without a title element alone', () => {
    const headless = '<!DOCTYPE html><html><head></head><body></body></html>';

    expect(applyAppTitle(headless, 'Beispiel')).toBe(headless);
  });

  /**
   * The patch exists because the shipped shell carries a title of its own. If
   * upstream ever drops or renames that element, the replacement would quietly
   * do nothing — this is the test that says so instead.
   */
  it('finds a title element in the shipped client shell', () => {
    const shellPath = path.resolve(__dirname, '../../../../client/index.html');
    const shell = fs.readFileSync(shellPath, 'utf8');

    expect(titleOf(shell)).toBeDefined();
    expect(titleOf(applyAppTitle(shell, 'Beispiel GmbH KI'))).toBe('Beispiel GmbH KI');
  });
});
