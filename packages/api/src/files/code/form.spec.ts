import { Readable } from 'stream';
import FormData from 'form-data';

import { appendCodeEnvFile, getCodeEnvFileOptions } from './form';

function renderMultipartDisposition(append: (form: FormData) => void): Promise<string> {
  const form = new FormData();
  append(form);

  const chunks: Buffer[] = [];
  form.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  return new Promise<string>((resolve, reject) => {
    form.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      resolve(body.match(/Content-Disposition:.*/)?.[0] ?? '');
    });
    form.on('error', reject);
    form.resume();
  });
}

describe('code env FormData filenames', () => {
  it('uses filepath for nested filenames so form-data preserves directories', async () => {
    const disposition = await renderMultipartDisposition((form) => {
      appendCodeEnvFile(form, Readable.from(['x']), 'pptx/pptx.py');
    });

    expect(disposition).toContain('filename="pptx/pptx.py"');
  });

  it('documents the form-data string overload regression', async () => {
    const disposition = await renderMultipartDisposition((form) => {
      form.append('file', Readable.from(['x']), 'pptx/pptx.py');
    });

    expect(disposition).toContain('filename="pptx.py"');
  });

  it('keeps flat filenames as filename-only options', () => {
    expect(getCodeEnvFileOptions('script.py')).toEqual({ filename: 'script.py' });
  });

  it('normalizes Windows separators before sending path-bearing filenames', () => {
    expect(getCodeEnvFileOptions('pptx\\pptx.py')).toEqual({
      filename: 'pptx.py',
      filepath: 'pptx/pptx.py',
    });
  });
});
