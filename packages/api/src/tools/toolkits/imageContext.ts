export interface ImageToolContextOptions {
  /** The tool key identifier, e.g., 'gemini_image_gen' or 'image_edit_oai' */
  toolKey: string;
  /** The purpose description, e.g., 'image context' or 'image editing' */
  purpose: string;
}

/**
 * Creates tool context for image generation/editing tools by building a description
 * of available image files that can be used as visual context.
 *
 * @param imageFiles - Array of image file objects with file_id property
 * @param toolContextMap - Map to store the generated context, keyed by tool name
 * @param options - Configuration options including toolKey and purpose
 * @returns The generated tool context string, or empty string if no images
 */
export function createImageToolContext(
  imageFiles: Array<{ file_id: string } | undefined>,
  toolContextMap: Record<string, string>,
  options: ImageToolContextOptions,
): string {
  const { toolKey, purpose } = options;
  let toolContext = '';

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    if (!file) {
      continue;
    }

    if (i === 0) {
      toolContext = `Image files provided in this request (their image IDs listed in order of appearance) available for ${purpose}:`;
    }

    toolContext += `\n\t- ${file.file_id}`;

    if (i === imageFiles.length - 1) {
      toolContext += `\n\nInclude any you need in the \`image_ids\` array when calling \`${toolKey}\`. You may also include previously referenced or generated image IDs.`;
    }
  }

  if (toolContext) {
    toolContextMap[toolKey] = toolContext;
  }

  return toolContext;
}
