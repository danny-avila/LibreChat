const { mediaToolReceiptSchema } = require('librechat-data-provider');

function mediaImageResponses({
  text,
  toolNames,
  getMarkerValue,
  findLastToolMessage,
  getContentText,
}) {
  const label = getMarkerValue(text, 'E2E_MEDIA_IMAGE:');
  if (!label) return null;
  if (!toolNames.has('media_generate')) {
    return { responses: ['E2E media image failed: media_generate was not advertised'] };
  }
  const toolCallId = `call_e2e_media_image_${label}`;
  return {
    responses: ['', ''],
    toolCalls: [
      {
        id: toolCallId,
        name: 'media_generate',
        args: {
          operation: 'image.generate',
          prompt: label,
          connectionId: 'fixture-images',
          modelId: 'gpt-image-1',
          inputs: [],
          parameters: { count: 1 },
        },
        type: 'tool_call',
      },
    ],
    resolveOnStream: (messages) => {
      const result = findLastToolMessage(messages, toolCallId);
      if (!result) return null;
      let output;
      try {
        output = JSON.parse(getContentText(result.content));
      } catch {
        return { responses: ['E2E media image failed: invalid tool response'] };
      }
      const receipt = mediaToolReceiptSchema.safeParse(output?.media);
      if (
        !receipt.success ||
        receipt.data.operation !== 'image.generate' ||
        receipt.data.phase !== 'succeeded'
      ) {
        return { responses: ['E2E media image failed: no successful durable receipt'] };
      }
      if (
        !Array.isArray(output.files) ||
        output.files.length !== 1 ||
        output.files.some(
          (file) =>
            typeof file.file_id !== 'string' ||
            !file.file_id ||
            typeof file.type !== 'string' ||
            !file.type.startsWith('image/'),
        )
      ) {
        return { responses: ['E2E media image failed: no persisted image File'] };
      }
      return { responses: ['E2E media image ready'] };
    },
  };
}

module.exports = { mediaImageResponses };
