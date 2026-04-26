import { imageExtRegex } from 'librechat-data-provider';
import type { TAttachment, TAttachmentMetadata, TFile } from 'librechat-data-provider';
import { detectArtifactTypeFromFile, TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import type { ToolArtifactType } from '~/utils/artifacts';

/**
 * An attachment is treated as an image only when it has the dimensions and
 * filepath needed to render via `<Image>`. Without width/height the image
 * cannot reserve layout space, so we fall back to the file card.
 */
export const isImageAttachment = (attachment: TAttachment): boolean => {
  if (!attachment.filename) {
    return false;
  }
  const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
  return (
    imageExtRegex.test(attachment.filename) && width != null && height != null && filepath != null
  );
};

/**
 * An attachment renders inline as text when the backend has populated a
 * non-empty `text` field on the underlying file record. Empty strings are
 * treated as "no inline text available" and fall through to the download UI.
 */
export const isTextAttachment = (attachment: TAttachment): boolean => {
  const { text } = attachment as TFile & TAttachmentMetadata;
  return typeof text === 'string' && text.length > 0;
};

/**
 * The artifact MIME type a tool-output attachment maps to, or `null` if
 * we don't have a viewer for it. Layered on `detectArtifactTypeFromFile`
 * so the routing logic stays in one place; classifying happens here so
 * the message-render code reads cleanly.
 */
export const artifactTypeForAttachment = (attachment: TAttachment): ToolArtifactType | null => {
  const file = attachment as TFile & TAttachmentMetadata;
  return detectArtifactTypeFromFile(file);
};

export const isMermaidArtifact = (attachment: TAttachment): boolean =>
  artifactTypeForAttachment(attachment) === TOOL_ARTIFACT_TYPES.MERMAID;

/** True for HTML / JSX / TSX / Markdown — types we render via the side panel. */
export const isPanelArtifact = (attachment: TAttachment): boolean => {
  const type = artifactTypeForAttachment(attachment);
  return type != null && type !== TOOL_ARTIFACT_TYPES.MERMAID;
};
