/**
 * Builds tool context string for image generation tools based on available image files.
 * @param params - The parameters for building image context
 * @param params.imageFiles - Array of image file objects with file_id property
 * @param params.toolName - The name of the tool (e.g., 'gemini_image_gen', 'image_edit_oai')
 * @param params.contextDescription - Description of what the images are for (e.g., 'image context', 'image editing')
 * @returns The tool context string or empty string if no images
 */
export function buildImageToolContext({
  imageFiles,
  toolName,
  contextDescription = 'image context',
}: {
  imageFiles: Array<{ file_id: string }>;
  toolName: string;
  contextDescription?: string;
}): string {
  if (!imageFiles || imageFiles.length === 0) {
    return '';
  }

  let toolContext = '';
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    if (!file) {
      continue;
    }
    if (i === 0) {
      toolContext = `Image files provided in this request (their image IDs listed in order of appearance) available for ${contextDescription}:`;
    }
    toolContext += `\n\t- ${file.file_id}`;
    if (i === imageFiles.length - 1) {
      toolContext += `\n\nInclude any you need in the \`image_ids\` array when calling \`${toolName}\` to use them as visual context for generation. You may also include previously referenced or generated image IDs.`;
    }
  }
  return toolContext;
}

