import { ARTIFACT_SOURCE_KEY_PREFIX } from 'librechat-data-provider';
import type { ArtifactRuntimeType, TSyncArtifactAppRequest } from 'librechat-data-provider';
import type { Artifact } from '~/common';

const INLINE_DEFAULT_IDENTIFIER = 'lc-no-identifier';

const runtimeByMime: Record<string, ArtifactRuntimeType> = {
  'application/vnd.react': 'react',
  'application/vnd.ant.react': 'react',
  'text/html': 'html',
  'application/vnd.code-html': 'html',
  'image/svg+xml': 'svg',
  'application/vnd.mermaid': 'mermaid',
  'text/markdown': 'markdown',
  'text/md': 'markdown',
  'text/plain': 'text',
  'application/vnd.code': 'code',
  'application/vnd.librechat.docx-preview': 'document',
  'application/vnd.librechat.spreadsheet-preview': 'spreadsheet',
  'application/vnd.librechat.presentation-preview': 'presentation',
};

export function getArtifactRuntimeType(
  type: string | null | undefined,
): ArtifactRuntimeType | null {
  if (!type) {
    return null;
  }
  return runtimeByMime[type] ?? null;
}

/**
 * Stable identity for an artifact inside a conversation. LLM-authored inline
 * artifacts retain their identifier across revisions; tool artifacts retain
 * their file id. The message/index fallback intentionally scopes an artifact
 * without an identifier to the message that created it.
 */
export function getArtifactSourceKey(artifact: Artifact | null | undefined): string | null {
  if (!artifact?.type) {
    return null;
  }
  if (artifact.id.startsWith('tool-artifact-')) {
    return `${ARTIFACT_SOURCE_KEY_PREFIX}file:${artifact.id}`.slice(0, 500);
  }
  if (artifact.identifier && artifact.identifier !== INLINE_DEFAULT_IDENTIFIER) {
    return `${ARTIFACT_SOURCE_KEY_PREFIX}identifier:${artifact.identifier}`.slice(0, 500);
  }
  if (!artifact.messageId) {
    return null;
  }
  return `${ARTIFACT_SOURCE_KEY_PREFIX}message:${artifact.messageId}:${artifact.index ?? 0}:${artifact.type}`.slice(
    0,
    500,
  );
}

export function toArtifactSyncRequest(
  artifact: Artifact,
  conversationId: string,
): TSyncArtifactAppRequest | null {
  const sourceKey = getArtifactSourceKey(artifact);
  const runtimeType = getArtifactRuntimeType(artifact.type);
  const content = artifact.content?.trim();
  if (!sourceKey || !runtimeType || !content) {
    return null;
  }

  const generatedTitle = artifact.title?.trim();
  const fallbackTitle = `Artifact ${(artifact.index ?? 0) + 1}`;
  return {
    title: generatedTitle && generatedTitle !== 'untitled' ? generatedTitle : fallbackTitle,
    artifact: {
      type: runtimeType,
      content: artifact.content as string,
      title: generatedTitle || undefined,
      language: artifact.language,
      preview: artifact.preview,
    },
    source: {
      conversationId,
      messageId: artifact.messageId,
      originalArtifactId: artifact.id,
      sourceKey,
    },
  };
}

export function toLatestArtifactSyncRequests(
  artifacts: Record<string, Artifact | undefined>,
  conversationId: string,
): TSyncArtifactAppRequest[] {
  const latestBySource = new Map<
    string,
    { request: TSyncArtifactAppRequest; lastUpdateTime: number }
  >();

  for (const artifact of Object.values(artifacts)) {
    if (!artifact) {
      continue;
    }
    const request = toArtifactSyncRequest(artifact, conversationId);
    if (!request) {
      continue;
    }
    const existing = latestBySource.get(request.source.sourceKey);
    if (existing && existing.lastUpdateTime > artifact.lastUpdateTime) {
      continue;
    }
    latestBySource.set(request.source.sourceKey, {
      request,
      lastUpdateTime: artifact.lastUpdateTime,
    });
  }

  return Array.from(latestBySource.values(), ({ request }) => request);
}

export function isCatalogSupportedArtifact(artifact: Artifact | null | undefined): boolean {
  return getArtifactRuntimeType(artifact?.type) != null;
}
