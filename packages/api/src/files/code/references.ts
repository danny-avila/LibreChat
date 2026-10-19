import type { CodeEnvRef, TFile } from 'librechat-data-provider';

type Reference = { ref: CodeEnvRef; contentKey: string };
export type CodeFileReferences = Map<string, Map<string, Reference>>;
interface ReferenceRequest {
  codeFileReferences?: CodeFileReferences;
}

function contentKey(file: TFile): string {
  return JSON.stringify([
    file.metadata?.sourceDispatchedAt ?? file.updatedAt,
    file.createdAt,
    file.filepath,
    file.bytes,
    file.type,
  ]);
}

function referenceKey(routeKey: string, fileId: string): string {
  return JSON.stringify([routeKey, fileId]);
}

export function getTurnCodeEnvRef(
  req: ReferenceRequest,
  routeKey: string,
  file: TFile,
  destination?: string,
): CodeEnvRef | undefined {
  const refs = req.codeFileReferences?.get(referenceKey(routeKey, file.file_id));
  if (!refs) return undefined;
  const version = contentKey(file);
  if (destination != null) {
    const entry = refs.get(destination);
    return entry?.contentKey === version ? entry.ref : undefined;
  }
  for (const entry of refs.values()) {
    if (entry.contentKey === version) return entry.ref;
  }
  return undefined;
}

export async function saveCodeFileReference({
  req,
  routeKey,
  file,
  ref,
  temporary,
  save,
}: {
  req: ReferenceRequest;
  routeKey: string;
  file: TFile;
  ref: CodeEnvRef;
  temporary: boolean;
  save: () => Promise<unknown>;
}): Promise<void> {
  if (!temporary) {
    await save();
    return;
  }
  if (!ref.sandboxFilename) {
    throw new Error('A temporary code reference requires its stored destination');
  }
  const refs = (req.codeFileReferences ??= new Map());
  const key = referenceKey(routeKey, file.file_id);
  let destinations = refs.get(key);
  if (!destinations) {
    destinations = new Map();
    refs.set(key, destinations);
  }
  destinations.set(ref.sandboxFilename, { ref: { ...ref }, contentKey: contentKey(file) });
}
