/**
 * Strip require/import of pptxgenjs and "new PptxGenJS()" / "new pptxgen()"
 * so LLM-generated code uses the pre-initialized pres variable we provide.
 */
function cleanPptxCode(code: string): string {
  return code
    .replace(/^\s*(const|let|var)\s+\w+\s*=\s*require\(\s*["']pptxgenjs["']\s*\)\s*;?/gm, '')
    .replace(/^\s*import\s+.*\s+from\s+["']pptxgenjs["']\s*;?/gm, '')
    .replace(/^\s*(const|let|var)\s+pres\s*=\s*new\s+\w+\(\s*\)\s*;?/gm, '');
}

/**
 * Executes PptxGenJS code and triggers a .pptx download.
 * Used by DownloadArtifact for application/vnd.pptx artifacts.
 */
export async function downloadPptx(code: string, fileName = 'presentation.pptx'): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pres = new PptxGenJS();

  // Override writeFile to capture the blob and download manually
  pres.writeFile = async (opts?: { fileName?: string }) => {
    const blob = (await pres.write({ outputType: 'blob' })) as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = opts?.fileName || fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return '';
  };

  const cleanedCode = cleanPptxCode(code);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction('pptxgen', 'pres', 'require', cleanedCode);
  await fn(PptxGenJS, pres, () => PptxGenJS);
}
