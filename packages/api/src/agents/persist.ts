export type WriteAction = 'Created' | 'Updated';

export type NamedWriteFile = {
  name?: string | null;
};

export type WriteEvidence =
  | { kind: 'named-files'; files?: ReadonlyArray<NamedWriteFile> | null }
  | { kind: 'body'; body?: string | null }
  | { kind: 'bytes'; bytes?: number | null };

export type VerifiedWrite = { ok: true; summary: string } | { ok: false; message: string };

function fileBaseName(filePath: string): string {
  const separator = filePath.lastIndexOf('/');
  return separator === -1 ? filePath : filePath.slice(separator + 1);
}

function namedFilesIncludePath(
  files: ReadonlyArray<NamedWriteFile> | null | undefined,
  filePath: string,
): boolean {
  if (!Array.isArray(files) || files.length === 0) {
    return false;
  }
  const baseName = fileBaseName(filePath);
  for (const file of files) {
    const name = file?.name;
    if (typeof name !== 'string' || name.length === 0) {
      continue;
    }
    if (name === filePath || name === baseName || fileBaseName(name) === baseName) {
      return true;
    }
  }
  return false;
}

function persistenceFailure(path: string, detail: string): VerifiedWrite {
  return {
    ok: false,
    message: `Write of "${path}" did not persist (${detail}). The file is not available to later calls.`,
  };
}

function evidenceFailure(path: string, content: string, evidence: WriteEvidence): string | null {
  if (evidence.kind === 'named-files') {
    return namedFilesIncludePath(evidence.files, path)
      ? null
      : 'the sandbox result did not include that file';
  }
  if (evidence.kind === 'body') {
    if (typeof evidence.body !== 'string') {
      return 'the stored file body was missing';
    }
    if (content.length > 0 && evidence.body.length === 0) {
      return 'the stored file body was empty';
    }
    return null;
  }

  const expectedBytes = Buffer.byteLength(content, 'utf8');
  if (typeof evidence.bytes !== 'number' || !Number.isFinite(evidence.bytes)) {
    return 'the write returned no size';
  }
  if (evidence.bytes !== expectedBytes) {
    return `expected ${expectedBytes} bytes, got ${evidence.bytes}`;
  }
  return null;
}

/**
 * Builds a create/update summary only after persistence evidence confirms
 * the write landed. Callers must not mint "Created … (N chars)" from the
 * input string alone.
 */
export function summarizeVerifiedWrite({
  action,
  path,
  content,
  evidence,
}: {
  action: WriteAction;
  path: string;
  content: string;
  evidence: WriteEvidence;
}): VerifiedWrite {
  const failure = evidenceFailure(path, content, evidence);
  if (failure != null) {
    return persistenceFailure(path, failure);
  }
  return {
    ok: true,
    summary: `${action} ${path} (${content.length} chars).`,
  };
}
