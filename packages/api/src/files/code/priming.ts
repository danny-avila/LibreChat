import {
  getCodeEnvRefs,
  getCodeEnvRefForProfile,
  resolveSandboxFilename,
} from 'librechat-data-provider';
import type { CodeEnvRef, TFile } from 'librechat-data-provider';
import type { AxiosInstance } from 'axios';
import type { CodeExecutionRoute } from '../provision/service';
import type { ServerRequest } from '~/types';
import {
  codeServerHttpAgent,
  codeServerHttpsAgent,
  createCodeApiUploadRegistry,
  withCodeApiUploadSlot,
} from '~/utils/code';
import {
  createCodeDestinationSet,
  reserveCodeDestination,
  sortCodeFilesByDestinationPriority,
} from './destinations';
import { codeExecutionHeaders } from '~/agents/execution';
import { buildCodeEnvDownloadQuery } from './identity';
import { isAbortError } from '~/utils/errors';

export interface CodeFileInfo {
  lastModified?: string;
  originalFilename?: string;
}

/** The object metadata endpoint reports the same original filename as the download header. */
export async function getCodeFileInfo({
  ref,
  req,
  route,
  signal,
  request,
  getBaseURL,
  getAuthHeaders,
}: {
  ref: CodeEnvRef;
  req: ServerRequest;
  route: CodeExecutionRoute & { bridgeWorkerId?: string };
  signal?: AbortSignal;
  request: AxiosInstance;
  getBaseURL: () => string;
  getAuthHeaders: (req: ServerRequest, bridgeWorkerId?: string) => Promise<Record<string, string>>;
}): Promise<CodeFileInfo | null> {
  try {
    signal?.throwIfAborted();
    const headers = await getAuthHeaders(req, route.bridgeWorkerId);
    signal?.throwIfAborted();
    const query = buildCodeEnvDownloadQuery(ref);
    const response = await request<CodeFileInfo>({
      method: 'get',
      url: `${route.baseUrl ?? getBaseURL()}/sessions/${ref.storage_session_id}/objects/${ref.file_id}${query}`,
      headers: {
        'User-Agent': 'LibreChat/1.0',
        ...headers,
        ...(route.executionProfile
          ? codeExecutionHeaders({
              executionProfile: route.executionProfile,
              bridgeWorkerId: route.bridgeWorkerId,
            })
          : {}),
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 5000,
      signal,
    });
    signal?.throwIfAborted();
    return response.data;
  } catch (error) {
    if (signal?.aborted && isAbortError(error)) {
      throw error;
    }
    signal?.throwIfAborted();
    return null;
  }
}

interface PrimedCodeFile {
  file: TFile;
  ref: CodeEnvRef | undefined;
  sourceRef: CodeEnvRef;
  sandboxName: string;
  getUploadTime: () => Promise<string | undefined>;
}

/** Reserve actual storage destinations before recovery so a failed winner never revives stale content. */
export async function selectCodeFiles({
  files,
  privateFileIds,
  routeKey,
  getFileInfo,
  concurrency,
  signal,
}: {
  files: Array<TFile | null | undefined>;
  privateFileIds?: ReadonlySet<string>;
  routeKey: string;
  getFileInfo: (ref: CodeEnvRef) => Promise<CodeFileInfo | null>;
  concurrency?: number;
  signal?: AbortSignal;
}): Promise<{ selected: PrimedCodeFile[]; skippedNoRef: number; skippedSuperseded: number }> {
  let skippedNoRef = 0;
  let skippedSuperseded = 0;
  const candidates = [];
  const registry = createCodeApiUploadRegistry();
  for (const file of sortCodeFilesByDestinationPriority(files, privateFileIds)) {
    if (!file) {
      continue;
    }
    const ref = getCodeEnvRefForProfile(file.metadata, routeKey);
    const sourceRef = ref ?? getCodeEnvRefs(file.metadata)[0]?.[1];
    if (!sourceRef) {
      skippedNoRef++;
      continue;
    }
    let probe: Promise<CodeFileInfo | null> | undefined;
    const getInfo = () =>
      (probe ??= withCodeApiUploadSlot({
        registry,
        scope: routeKey,
        concurrency,
        signal,
        task: () => getFileInfo(sourceRef),
      }));
    candidates.push({ file, ref, sourceRef, getInfo });
  }
  // Legacy references lack the upload destination. Probe concurrently and reuse the result for freshness.
  const resolved = await Promise.all(
    candidates.map(async (candidate) => {
      const { file, ref, sourceRef, getInfo } = candidate;
      const info = ref && !sourceRef.sandboxFilename ? await getInfo() : undefined;
      signal?.throwIfAborted();
      return {
        ...candidate,
        sandboxName:
          sourceRef.sandboxFilename ??
          info?.originalFilename ??
          resolveSandboxFilename(file.filename, file.type),
        getUploadTime: async () => (await getInfo())?.lastModified,
      };
    }),
  );
  const destinations = createCodeDestinationSet();
  const selected = [];
  for (const candidate of resolved) {
    if (!reserveCodeDestination(destinations, candidate.sandboxName)) {
      skippedSuperseded++;
      continue;
    }
    selected.push(candidate);
  }
  return { selected, skippedNoRef, skippedSuperseded };
}
