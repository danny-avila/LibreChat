import { logger } from '@librechat/data-schemas';
import { codeTypeMapping } from 'librechat-data-provider';
import type { Response } from 'express';
import type { Readable } from 'stream';

/**
 * Headers describing the download that was abandoned. They have to go before an error body
 * replaces it: the code-output route copies the upstream response's headers verbatim, so a
 * proxied `Transfer-Encoding: chunked` would survive alongside the `Content-Length` that
 * `send` adds, and clients reject a message carrying both framings.
 */
const ABANDONED_DOWNLOAD_HEADERS = [
  'Content-Disposition',
  'Content-Type',
  'Content-Length',
  'Content-Encoding',
  'Transfer-Encoding',
  'X-File-Metadata',
];

/** The textual entries of `codeTypeMapping`, whose payload really is the bytes on disk —
 *  `message/rfc822` among them, since a `.eml` reaching the text pipeline is stored as its own
 *  RFC 822 source. Its remaining values are office documents and archives
 *  (`application/vnd.*`, `application/zip`). */
const TEXTUAL_MIME_PATTERN =
  /^text\/|^message\/rfc822$|^application\/(json|sql|typescript|xml|yaml|x-sh|vnd\.coffeescript)$/;

/**
 * Resolves the name a `FileSources.text` download is served under.
 *
 * Every `createTextFile` caller in `processAgentFileUpload` persists extracted or transcribed
 * UTF-8 text while keeping the upload's original name, so an OCR'd `report.pdf`, a parsed
 * `notes.docx` and a transcribed `meeting.mp3` all hold text under a name that promises
 * something else — the download would look corrupt or unplayable. The stored `type` cannot
 * tell those apart from a genuine text upload: the OCR, STT and document-parser paths leave it
 * at the `text/plain` default while the configured-text path stores the original `application/pdf`,
 * so both a derived and a genuine case exist at either value.
 *
 * The extension can, so rename only when it makes a non-text promise. A `.yaml`/`.go`/`.md`
 * upload keeps its own, and so does an extensionless `Dockerfile`, which promises nothing to
 * correct.
 */
export function getTextDownloadFilename(filename: string): string {
  if (!filename || !filename.includes('.')) {
    return filename;
  }
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const promisedType = codeTypeMapping[extension];
  if (promisedType && TEXTUAL_MIME_PATTERN.test(promisedType)) {
    return filename;
  }
  return `${filename.replace(/\.[^./\\]*$/, '')}.txt`;
}

/**
 * Pipes a download to the response, terminating it when the source fails.
 *
 * `pipe` does not end the destination on a source error, and the stream errors after the route
 * handler has already returned, so its try/catch never sees it. Without this the response stays
 * open until the reverse proxy times out. A stream with no `error` listener at all is worse
 * still: the emit becomes an uncaught exception.
 *
 * Nothing is written before the first chunk, so a failure that early can still answer with a
 * status; once the body has started, destroying the socket is the only way to signal a
 * truncated download instead of a short but well-formed one.
 */
export function pipeDownloadStream(stream: Readable, res: Response): void {
  stream.on('error', (streamError: Error) => {
    logger.error('[DOWNLOAD ROUTE] Stream error:', streamError);
    if (res.headersSent) {
      res.destroy(streamError);
      return;
    }
    for (const header of ABANDONED_DOWNLOAD_HEADERS) {
      res.removeHeader(header);
    }
    res.status(500).send('Error downloading file');
  });
  stream.pipe(res);
}
