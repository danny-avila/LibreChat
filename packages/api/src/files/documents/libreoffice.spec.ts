import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  _resetLibreOfficeProbeCache,
  buildPdfEmbedDocument,
  convertOfficeToPdf,
  isLibreOfficeEnabled,
  LibreOfficeConversionError,
  LibreOfficeUnavailableError,
  LIBREOFFICE_TIMEOUT_MS,
  MAX_LIBREOFFICE_PDF_BYTES,
  probeLibreOfficeBinary,
  tryLibreOfficePreview,
} from './libreoffice';

/* Detect whether the host has a LibreOffice binary so the integration
 * tests below can conditionally engage. Most CI runners don't have
 * LibreOffice installed (it's a 500 MB dependency); we still exercise
 * the env-gating, the wrapper builder, and the failure-fallthrough
 * contract in those environments. */
function hasLibreOfficeOnPath(): boolean {
  for (const candidate of ['soffice', 'libreoffice']) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (result.status === 0) {
      return true;
    }
  }
  return false;
}
const LIBREOFFICE_INSTALLED = hasLibreOfficeOnPath();
const itIfLibreOffice = LIBREOFFICE_INSTALLED ? it : it.skip;

/* Fixtures sit next to the source files (matches `html.spec.ts` resolution). */
const FIXTURES_DIR = __dirname;
function readFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

describe('libreoffice (env gating + wrapper)', () => {
  const ORIGINAL_FLAG = process.env.OFFICE_PREVIEW_LIBREOFFICE;

  afterEach(() => {
    _resetLibreOfficeProbeCache();
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.OFFICE_PREVIEW_LIBREOFFICE;
    } else {
      process.env.OFFICE_PREVIEW_LIBREOFFICE = ORIGINAL_FLAG;
    }
  });

  describe('isLibreOfficeEnabled', () => {
    it.each([['true'], ['1'], ['yes'], ['TRUE'], ['Yes'], ['  true  ']])(
      'returns true for %j (matches OFFICE_PREVIEW_DISABLE_CDN parser semantics)',
      (value) => {
        process.env.OFFICE_PREVIEW_LIBREOFFICE = value;
        expect(isLibreOfficeEnabled()).toBe(true);
      },
    );

    it.each([['false'], ['0'], ['no'], [''], ['anything-else']])(
      'returns false for %j',
      (value) => {
        process.env.OFFICE_PREVIEW_LIBREOFFICE = value;
        expect(isLibreOfficeEnabled()).toBe(false);
      },
    );

    it('returns false when the env var is unset', () => {
      delete process.env.OFFICE_PREVIEW_LIBREOFFICE;
      expect(isLibreOfficeEnabled()).toBe(false);
    });
  });

  describe('buildPdfEmbedDocument', () => {
    /* The wrapper structure is the security-relevant surface. These
     * tests lock down the CSP, the iframe shape, and the fallback
     * contract — independent of whether LibreOffice is actually
     * installed. Same posture as the docx-preview / pptx-preview CDN
     * wrappers. */
    const FAKE_PDF_B64 = 'JVBERi0xLjQK'; // "%PDF-1.4\n" base64

    it('emits a complete sandboxed HTML document with PDF bytes embedded as a data block', () => {
      const html = buildPdfEmbedDocument(FAKE_PDF_B64);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('<title>Preview</title>');
      expect(html).toContain('id="lc-pdf"');
      /* PDF bytes live in a `<script type="application/octet-stream;base64">`
       * data block — the bootstrap reads it and constructs a blob: URL
       * at runtime. We deliberately do NOT use `<iframe src="data:
       * application/pdf;...">` because Chrome blocks data: navigations
       * inside sandboxed iframes (manual e2e on PR #12934 — surfaced
       * as the "This page has been blocked by Chrome" interstitial).
       * blob: URLs are same-origin and bypass that restriction. */
      expect(html).toContain('id="lc-pdf-data"');
      expect(html).toContain(FAKE_PDF_B64);
      expect(html).not.toMatch(/src="data:application\/pdf/);
      /* The bootstrap code that converts the base64 to a blob URL. */
      expect(html).toContain('URL.createObjectURL');
      expect(html).toContain('new Blob');
      expect(html).toContain("type: 'application/pdf'");
    });

    it('CSP allows blob: in frame-src (NOT data:) and locks the iframe down otherwise', () => {
      const html = buildPdfEmbedDocument(FAKE_PDF_B64);
      const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
      expect(cspMatch).not.toBeNull();
      const csp = cspMatch![1];
      expect(csp).toMatch(/default-src 'none'/);
      /* blob: in frame-src, NOT data: — Chrome blocks data:application/pdf
       * navigations inside sandboxed iframes (anti-phishing measure
       * since Chrome 76). The bootstrap creates blob: URLs at runtime
       * which Chrome treats as same-origin and allows. Manual e2e on
       * PR #12934. */
      expect(csp).toMatch(/frame-src[^;]*\bblob:/);
      expect(csp).not.toMatch(/frame-src[^;]*\bdata:/);
      /* No outbound HTTP from the rendered iframe — a malicious PDF
       * can't beacon home from inside the viewer. */
      expect(csp).toMatch(/connect-src 'none'/);
      /* No external scripts (unlike docx-preview / pptx-preview the
       * native browser PDF viewer doesn't need a CDN library). */
      expect(csp).not.toMatch(/cdn\.jsdelivr\.net/);
      expect(csp).not.toMatch(/unsafe-eval/);
      expect(csp).toMatch(/base-uri 'none'/);
      expect(csp).toMatch(/form-action 'none'/);
    });

    it('exposes a fallback message that surfaces when the browser PDF viewer is disabled', () => {
      const html = buildPdfEmbedDocument(FAKE_PDF_B64);
      expect(html).toContain('id="lc-fallback"');
      expect(html).toContain('PDF preview unavailable in this browser');
      /* The 4-second heuristic timer that swaps to the fallback. */
      expect(html).toContain('4000');
      /* Reasons logged to console.error for power-user debugging. */
      expect(html).toContain("console.error('[libreoffice-pdf] fallback fired:'");
    });

    it('uses #view=FitH so the PDF fills the panel width on first paint', () => {
      const html = buildPdfEmbedDocument(FAKE_PDF_B64);
      expect(html).toContain('#view=FitH');
    });

    it('embeds large base64 payloads inside the data block without escaping issues', () => {
      /* The base64 alphabet (A-Za-z0-9+/=) contains no characters that
       * could break out of `<script type="application/octet-stream;
       * base64">...</script>` — base64 cannot contain `<`, `>`, `&`, or
       * quote characters. Sanity-check that the data round-trips. */
      const big = 'A'.repeat(100_000);
      const html = buildPdfEmbedDocument(big);
      const dataBlock = html.match(
        /<script id="lc-pdf-data" type="application\/octet-stream;base64">([^<]+)<\/script>/,
      );
      expect(dataBlock).not.toBeNull();
      expect(dataBlock![1]).toBe(big);
    });
  });

  describe('tryLibreOfficePreview (gating + fallthrough contract)', () => {
    it('returns null when the env flag is unset (default behavior)', async () => {
      delete process.env.OFFICE_PREVIEW_LIBREOFFICE;
      const buf = readFixture('sample.docx');
      const out = await tryLibreOfficePreview(buf, 'docx', 512 * 1024);
      expect(out).toBeNull();
    });

    it('returns null when env flag is "false"', async () => {
      process.env.OFFICE_PREVIEW_LIBREOFFICE = 'false';
      const buf = readFixture('sample.docx');
      const out = await tryLibreOfficePreview(buf, 'docx', 512 * 1024);
      expect(out).toBeNull();
    });

    it('never throws — falls through to null on any conversion failure', async () => {
      /* Even if the binary IS available, a malformed buffer should
       * cause `convertOfficeToPdf` to throw and `tryLibreOfficePreview`
       * to swallow it. The dispatcher pipeline takes over from there. */
      process.env.OFFICE_PREVIEW_LIBREOFFICE = 'true';
      const garbage = Buffer.from('this-is-definitely-not-a-docx');
      let threw = false;
      try {
        const out = await tryLibreOfficePreview(garbage, 'docx', 512 * 1024);
        expect(out).toBeNull();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('probeLibreOfficeBinary', () => {
    it("caches the probe result so we don't re-spawn `--version` on every call", async () => {
      _resetLibreOfficeProbeCache();
      const first = await probeLibreOfficeBinary();
      const second = await probeLibreOfficeBinary();
      /* Reference equality — second call returns the cached object. */
      expect(second).toBe(first);
    });

    it('returns availability=false with a reason when the binary is missing', async () => {
      _resetLibreOfficeProbeCache();
      /* Force the probe to miss by clobbering PATH so neither
       * `soffice` nor `libreoffice` resolves. */
      const originalPath = process.env.PATH;
      process.env.PATH = '/nonexistent';
      try {
        const probe = await probeLibreOfficeBinary();
        expect(probe.available).toBe(false);
        expect(probe.binary).toBeNull();
        expect(probe.reason).toMatch(/found on .?PATH/i);
      } finally {
        process.env.PATH = originalPath;
        _resetLibreOfficeProbeCache();
      }
    });
  });

  describe('error tagging', () => {
    it('LibreOfficeUnavailableError preserves the .name tag for callers', () => {
      const err = new LibreOfficeUnavailableError('binary missing');
      expect(err.name).toBe('LibreOfficeUnavailableError');
      expect(err).toBeInstanceOf(Error);
    });

    it('LibreOfficeConversionError carries optional stderr context', () => {
      const err = new LibreOfficeConversionError('exit 1', 'soffice: oops');
      expect(err.name).toBe('LibreOfficeConversionError');
      expect(err.stderr).toBe('soffice: oops');
    });

    it('exports tunable subprocess limits so tests can read documented values', () => {
      expect(LIBREOFFICE_TIMEOUT_MS).toBe(30_000);
      expect(MAX_LIBREOFFICE_PDF_BYTES).toBe(50 * 1024 * 1024);
    });
  });
});

/* eslint-disable jest/no-standalone-expect -- the `itIfLibreOffice` alias
 * collapses to `it.skip` when LibreOffice isn't installed; the lint rule
 * doesn't realize the `expect`s below are still scoped to a real test
 * block via the alias. Disabling locally is cleaner than restructuring
 * to satisfy a static check that's wrong about this pattern. */
describe('libreoffice integration (skipped unless LibreOffice is on $PATH)', () => {
  /* These tests engage only when `soffice` (or `libreoffice`) is
   * actually installed. Local dev with the binary present runs them;
   * stock CI runners skip. The skip is per-test rather than describe-
   * level so a printout makes the gating visible. */
  const ORIGINAL_FLAG = process.env.OFFICE_PREVIEW_LIBREOFFICE;

  beforeEach(() => {
    _resetLibreOfficeProbeCache();
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.OFFICE_PREVIEW_LIBREOFFICE;
    } else {
      process.env.OFFICE_PREVIEW_LIBREOFFICE = ORIGINAL_FLAG;
    }
  });

  itIfLibreOffice('probeLibreOfficeBinary detects the installed binary', async () => {
    const probe = await probeLibreOfficeBinary();
    expect(probe.available).toBe(true);
    expect(probe.binary).toMatch(/^(soffice|libreoffice)$/);
    expect(probe.versionLine).toMatch(/LibreOffice/i);
  });

  itIfLibreOffice(
    'convertOfficeToPdf converts a DOCX to PDF bytes',
    async () => {
      const buf = readFixture('sample.docx');
      const pdf = await convertOfficeToPdf(buf, 'docx');
      /* PDF magic bytes: 25 50 44 46 == "%PDF". */
      expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(pdf.length).toBeGreaterThan(500);
    },
    35_000,
  );

  itIfLibreOffice(
    'convertOfficeToPdf converts a PPTX to PDF bytes',
    async () => {
      const buf = readFixture('sample.pptx');
      const pdf = await convertOfficeToPdf(buf, 'pptx');
      expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    },
    35_000,
  );

  itIfLibreOffice(
    'tryLibreOfficePreview produces a PDF embed doc when env=true and binary is available',
    async () => {
      process.env.OFFICE_PREVIEW_LIBREOFFICE = 'true';
      _resetLibreOfficeProbeCache();
      const buf = readFixture('sample.docx');
      const out = await tryLibreOfficePreview(buf, 'docx', 512 * 1024);
      expect(out).not.toBeNull();
      expect(out!).toMatch(/^<!DOCTYPE html>/);
      /* PDF bytes are embedded as a base64 data block (not as a data:
       * URL — Chrome blocks data:application/pdf in sandboxed iframes;
       * the bootstrap converts to a blob: URL at runtime). */
      expect(out!).toContain('id="lc-pdf-data"');
      expect(out!).toContain('URL.createObjectURL');
      expect(Buffer.byteLength(out!, 'utf-8')).toBeLessThanOrEqual(512 * 1024);
    },
    35_000,
  );

  itIfLibreOffice(
    'returns null when the embedded PDF would exceed the output cap',
    async () => {
      /* Force the cap below the smallest possible PDF so the size
       * check trips. The conversion still runs (verifying the
       * subprocess works) but `tryLibreOfficePreview` declines to
       * emit oversized output and the dispatcher falls through. */
      process.env.OFFICE_PREVIEW_LIBREOFFICE = 'true';
      _resetLibreOfficeProbeCache();
      const buf = readFixture('sample.docx');
      const out = await tryLibreOfficePreview(buf, 'docx', 100);
      expect(out).toBeNull();
    },
    35_000,
  );
});
