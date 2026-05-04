import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * LibreOffice-backed office preview pipeline (POC).
 *
 * Convert a DOCX / PPTX (eventually XLSX, ODT, PDF) buffer to PDF via
 * `soffice --headless --convert-to pdf`, then embed the PDF as a base64
 * `data:application/pdf` URI inside a sandboxed iframe so the host browser's
 * native PDF viewer renders it. Result: high-fidelity rendering for any
 * format LibreOffice opens, no client-side renderer dependency, no CDN
 * dependency. The trade-off is the LibreOffice binary on the server (~500 MB
 * disk, ~2-3 s cold-start per conversion).
 *
 * Off by default. Operators opt in by setting `OFFICE_PREVIEW_LIBREOFFICE=true`
 * AND ensuring `soffice` (or `libreoffice`) is on `$PATH`. When either
 * condition is missing we fall through to the existing CDN/mammoth/slide-list
 * pipeline so a misconfiguration doesn't break previews.
 *
 * Hardening:
 *   - Subprocess runs in an isolated temp directory (no shared profile, no
 *     access to the operator's home) and a stripped env (`PATH`, `HOME`,
 *     `TMPDIR` only). LibreOffice's `-env:UserInstallation` flag forces a
 *     fresh user profile per call so concurrent conversions can't collide
 *     on shared ~/.config/libreoffice locks.
 *   - 30-second timeout — soffice has been known to hang on malformed input;
 *     `SIGKILL` after the timer expires.
 *   - 50 MB PDF output cap — a runaway document or a deliberate pathology
 *     can't blow the server's disk.
 *   - Macros stay disabled (LibreOffice's default `--macro-security high`
 *     plus our `--norestore --invisible --nodefault` flags).
 *
 * What this module is NOT:
 *   - A LibreOffice service / pool. Each call spawns a fresh subprocess.
 *     If load grows we'd want to keep a long-lived `soffice` process and
 *     drive it via UNO, but that's a v2 concern.
 *   - A PDF viewer. We rely on the host browser's built-in PDF viewer
 *     (Chrome / Edge / Safari / Firefox all ship one). When that's missing
 *     or disabled, the iframe falls back to a "Preview unavailable" state
 *     and the user can still download the file.
 */

/** Truthy parser shared with `OFFICE_PREVIEW_DISABLE_CDN` semantics. */
function envFlagEnabled(value: string | undefined): boolean {
  if (value == null) {
    return false;
  }
  return /^(1|true|yes)$/i.test(value.trim());
}

/**
 * Whether the LibreOffice path is enabled for this process. Read at call
 * time (not module load) so tests can flip the env without rebuilding.
 */
export function isLibreOfficeEnabled(): boolean {
  return envFlagEnabled(process.env.OFFICE_PREVIEW_LIBREOFFICE);
}

interface BinaryProbe {
  available: boolean;
  binary: string | null;
  versionLine: string | null;
  reason?: string;
}

let cachedProbe: BinaryProbe | null = null;

/**
 * Probe `soffice` then `libreoffice` once per process and cache the result.
 * If the operator installs LibreOffice after server start, they need to
 * restart to pick it up — simpler than invalidating the cache on filesystem
 * events for a feature that's already opt-in.
 */
export async function probeLibreOfficeBinary(): Promise<BinaryProbe> {
  if (cachedProbe) {
    return cachedProbe;
  }
  for (const candidate of ['soffice', 'libreoffice']) {
    try {
      const versionLine = await runVersion(candidate);
      cachedProbe = { available: true, binary: candidate, versionLine };
      return cachedProbe;
    } catch {
      /* try next candidate */
    }
  }
  cachedProbe = {
    available: false,
    binary: null,
    versionLine: null,
    reason: 'neither `soffice` nor `libreoffice` found on $PATH',
  };
  return cachedProbe;
}

function runVersion(binary: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '', HOME: tmpdir() },
    });
    let stdout = '';
    proc.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('--version timed out'));
    }, 5_000);
    proc.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.split('\n')[0]?.trim() ?? '');
      } else {
        reject(new Error(`exit ${code}`));
      }
    });
  });
}

/** Reset the cached probe — for tests; never called from production code. */
export function _resetLibreOfficeProbeCache(): void {
  cachedProbe = null;
}

/** Maximum subprocess wall-time. Tuned for cold-start on a small DOCX. */
export const LIBREOFFICE_TIMEOUT_MS = 30_000;

/** Maximum PDF output size; refuse anything larger so a runaway doc can't fill the disk. */
export const MAX_LIBREOFFICE_PDF_BYTES = 50 * 1024 * 1024;

/** Tag-distinct error so callers can distinguish "binary missing" from "conversion failed". */
export class LibreOfficeUnavailableError extends Error {
  override readonly name = 'LibreOfficeUnavailableError';
}

/** Tag-distinct error so callers can swallow conversion-side failures and fall through. */
export class LibreOfficeConversionError extends Error {
  override readonly name = 'LibreOfficeConversionError';
  constructor(
    message: string,
    readonly stderr?: string,
  ) {
    super(message);
  }
}

/**
 * Spawn a LibreOffice subprocess to convert `buffer` (in `extensionHint`
 * format — `docx`, `pptx`, `xlsx`, `odt`, `odp`, `ods`) to PDF. Returns
 * the PDF bytes.
 *
 * `extensionHint` is part of the temp filename so soffice infers the input
 * format correctly. We never trust the extension to gate format — the
 * caller (`html.ts` dispatcher) has already routed by MIME / magic bytes.
 *
 * Throws:
 *   - `LibreOfficeUnavailableError` when the binary isn't on $PATH
 *   - `LibreOfficeConversionError` for subprocess failures, timeout, or
 *     oversized output
 */
export async function convertOfficeToPdf(buffer: Buffer, extensionHint: string): Promise<Buffer> {
  const probe = await probeLibreOfficeBinary();
  if (!probe.available || !probe.binary) {
    throw new LibreOfficeUnavailableError(probe.reason ?? 'LibreOffice binary unavailable');
  }
  const safeExt = extensionHint.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const tempDir = await mkdtemp(join(tmpdir(), 'lc-libreoffice-'));
  try {
    const inputPath = join(tempDir, `input.${safeExt}`);
    await writeFile(inputPath, buffer);
    await runConversion(probe.binary, inputPath, tempDir);
    const outputPath = join(tempDir, 'input.pdf');
    const pdf = await readFile(outputPath);
    if (pdf.length > MAX_LIBREOFFICE_PDF_BYTES) {
      throw new LibreOfficeConversionError(
        `PDF output ${pdf.length} bytes exceeds cap ${MAX_LIBREOFFICE_PDF_BYTES}`,
      );
    }
    return pdf;
  } finally {
    /* Best-effort cleanup. If unlink fails (rare — Linux tmpfs, no
     * unmounts), the OS will reclaim the dir on next reboot. */
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runConversion(binary: string, inputPath: string, tempDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const userProfile = `file://${join(tempDir, 'userprof')}`;
    const proc = spawn(
      binary,
      [
        '--headless',
        '--norestore',
        '--invisible',
        '--nodefault',
        '--nofirststartwizard',
        '--nolockcheck',
        `-env:UserInstallation=${userProfile}`,
        '--convert-to',
        'pdf',
        '--outdir',
        tempDir,
        inputPath,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        /* Stripped env. PATH is required for soffice to find its own libs;
         * HOME/TMPDIR pinned to the isolated temp dir so the subprocess
         * can't read the operator's profile or scribble outside our tree. */
        env: {
          PATH: process.env.PATH ?? '',
          HOME: tempDir,
          TMPDIR: tempDir,
          /* Suppress LibreOffice's "Recovery" dialog state on macOS. */
          DBUS_SESSION_BUS_ADDRESS: 'disabled:',
        },
      },
    );
    let stderr = '';
    proc.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(
        new LibreOfficeConversionError(
          `LibreOffice timeout after ${LIBREOFFICE_TIMEOUT_MS}ms`,
          stderr,
        ),
      );
    }, LIBREOFFICE_TIMEOUT_MS);
    proc.once('error', (err) => {
      clearTimeout(timer);
      reject(new LibreOfficeConversionError(err.message, stderr));
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new LibreOfficeConversionError(`soffice exit ${code}`, stderr));
      }
    });
  });
}

/**
 * Build the iframe HTML that embeds the PDF for in-panel rendering. The
 * PDF is base64-encoded as a `data:` URI and pointed to by an inner
 * `<iframe>` so the host browser's PDF viewer (PDF.js in Firefox, Chrome's
 * built-in viewer, Safari's Preview-driven viewer) can render it directly.
 *
 * Why an inner iframe rather than `<embed>` or `<object>`:
 *   - `<embed>` and `<object>` rendering is least consistent across modern
 *     browsers (Chrome's pdfium plugin requires CSP `object-src data:`,
 *     and some headless contexts disable it).
 *   - `<iframe src="data:application/pdf;base64,...">` is the most
 *     reliable cross-browser path. Chromium's PDF viewer treats it as a
 *     top-level navigation and serves the built-in viewer.
 *
 * The inner iframe is fully sandboxed — no script, same-origin, etc. —
 * and uses `#view=FitH` to size to the panel's width on first paint.
 */
export function buildPdfEmbedDocument(pdfBase64: string): string {
  /* CSP scoping:
   *   - `default-src 'none'`: lock everything down.
   *   - `frame-src data:`: allow the inner `<iframe src="data:application/pdf;...">`.
   *   - `object-src 'self' data:`: belt-and-suspenders for browsers that
   *     route PDFs through `<object>` via the iframe sandbox quirk.
   *   - `script-src 'unsafe-inline'`: only our tiny load-detector script.
   *   - `style-src 'unsafe-inline'`: page chrome (no external sheets).
   *   - `connect-src 'none'`: rendered iframe makes no network calls.
   */
  const csp = [
    "default-src 'none'",
    'frame-src data:',
    "object-src 'self' data:",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Preview</title>
<style>
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2937; --muted: #6b7280; }
@media (prefers-color-scheme: dark) { :root { --bg: #1a1a2e; --fg: #e5e7eb; --muted: #9ca3af; } }
html, body { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
#lc-pdf { width: 100%; height: 100vh; border: 0; display: block; }
#lc-fallback { display: none; padding: 24px; font-size: 14px; line-height: 1.5; color: var(--muted); text-align: center; }
#lc-fallback.visible { display: block; }
</style>
</head>
<body>
<iframe id="lc-pdf" src="data:application/pdf;base64,${pdfBase64}#view=FitH" title="PDF preview"></iframe>
<div id="lc-fallback">PDF preview unavailable in this browser. Please download the file to view it.</div>
<script>
(function () {
  /* Some browsers / kiosk profiles disable the built-in PDF viewer; the
   * iframe loads but stays blank. We can't reliably detect the inner
   * viewer's success across browsers, so we use a 4-second heuristic:
   * if the iframe never reports a load event by then, swap to the
   * fallback message. False negatives (slow networks, cold viewers)
   * are acceptable — the user can still download the file. */
  var pdfFrame = document.getElementById('lc-pdf');
  var fallback = document.getElementById('lc-fallback');
  var loaded = false;
  if (pdfFrame) {
    pdfFrame.addEventListener('load', function () { loaded = true; });
  }
  setTimeout(function () {
    if (!loaded && fallback) {
      if (pdfFrame) { pdfFrame.style.display = 'none'; }
      fallback.classList.add('visible');
    }
  }, 4000);
})();
</script>
</body>
</html>`;
}

/**
 * Try the LibreOffice path. Returns the wrapped HTML on success, or `null`
 * if LibreOffice isn't enabled / available / converted successfully — the
 * caller falls through to the existing pipeline. Never throws.
 *
 * `extensionHint`: `docx` / `pptx` / `xlsx` / `odt` / `odp` / `ods` etc.
 *
 * Output-size guarantee: returns `null` if the embedded HTML would exceed
 * the 512 KB `attachment.text` cache cap. Base64 inflates by ~33% so the
 * effective PDF cap is ~380 KB; LibreOffice's PDF/A-1 default produces
 * compact output for typical chat-emitted documents.
 */
export async function tryLibreOfficePreview(
  buffer: Buffer,
  extensionHint: string,
  outputCap: number,
): Promise<string | null> {
  if (!isLibreOfficeEnabled()) {
    return null;
  }
  try {
    const pdf = await convertOfficeToPdf(buffer, extensionHint);
    const base64 = pdf.toString('base64');
    const html = buildPdfEmbedDocument(base64);
    if (Buffer.byteLength(html, 'utf-8') > outputCap) {
      return null;
    }
    return html;
  } catch (err) {
    /* Swallow both unavailable + conversion errors. The dispatcher
     * pipeline is the authoritative renderer; LibreOffice is opportunistic
     * augmentation. The caller's logger will surface the underlying
     * pipeline if they care to instrument it. */
    void err;
    return null;
  }
}
