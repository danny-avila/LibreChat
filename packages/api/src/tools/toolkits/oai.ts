import { z } from 'zod';

/** Default descriptions for image generation tool  */
const DEFAULT_IMAGE_GEN_DESCRIPTION =
  `Generates high-quality, original images based solely on text, not using any uploaded reference images.

When to use \`image_gen_oai\`:
- To create entirely new images from detailed text descriptions that do NOT reference any image files.

When NOT to use \`image_gen_oai\`:
- If the user has uploaded any images and requests modifications, enhancements, or remixing based on those uploads → use \`image_edit_oai\` instead.

Generated image IDs will be returned in the response, so you can refer to them in future requests made to \`image_edit_oai\`.` as const;

const getImageGenDescription = () => {
  return process.env.IMAGE_GEN_OAI_DESCRIPTION || DEFAULT_IMAGE_GEN_DESCRIPTION;
};

/** Default prompt descriptions  */
const DEFAULT_IMAGE_GEN_PROMPT_DESCRIPTION = `Describe the image you want in detail. 
      Be highly specific—break your idea into layers: 
      (1) main concept and subject,
      (2) composition and position,
      (3) lighting and mood,
      (4) style, medium, or camera details,
      (5) important features (age, expression, clothing, etc.),
      (6) background.
      Use positive, descriptive language and specify what should be included, not what to avoid. 
      List number and characteristics of people/objects, and mention style/technical requirements (e.g., "DSLR photo, 85mm lens, golden hour").
      Do not reference any uploaded images—use for new image creation from text only.` as const;

const getImageGenPromptDescription = () => {
  return process.env.IMAGE_GEN_OAI_PROMPT_DESCRIPTION || DEFAULT_IMAGE_GEN_PROMPT_DESCRIPTION;
};

/** Default description for image editing tool  */
const DEFAULT_IMAGE_EDIT_DESCRIPTION =
  `Generates high-quality, original images based on text and one or more uploaded/referenced images.

When to use \`image_edit_oai\`:
- The user wants to modify, extend, or remix one **or more** uploaded images, either:
- Previously generated, or in the current request (both to be included in the \`image_ids\` array).
- Always when the user refers to uploaded images for editing, enhancement, remixing, style transfer, or combining elements.
- Any current or existing images are to be used as visual guides.
- If there are any files in the current request, they are more likely than not expected as references for image edit requests.

When NOT to use \`image_edit_oai\`:
- Brand-new generations that do not rely on an existing image → use \`image_gen_oai\` instead.

Both generated and referenced image IDs will be returned in the response, so you can refer to them in future requests made to \`image_edit_oai\`.
`.trim();

const getImageEditDescription = () => {
  return process.env.IMAGE_EDIT_OAI_DESCRIPTION || DEFAULT_IMAGE_EDIT_DESCRIPTION;
};

const DEFAULT_IMAGE_EDIT_PROMPT_DESCRIPTION = `Describe the changes, enhancements, or new ideas to apply to the uploaded image(s).
      Be highly specific—break your request into layers: 
      (1) main concept or transformation,
      (2) specific edits/replacements or composition guidance,
      (3) desired style, mood, or technique,
      (4) features/items to keep, change, or add (such as objects, people, clothing, lighting, etc.).
      Use positive, descriptive language and clarify what should be included or changed, not what to avoid.
      Always base this prompt on the most recently uploaded reference images.`;

const getImageEditPromptDescription = () => {
  return process.env.IMAGE_EDIT_OAI_PROMPT_DESCRIPTION || DEFAULT_IMAGE_EDIT_PROMPT_DESCRIPTION;
};

export const oaiToolkit = {
  image_gen_oai: {
    name: 'image_gen_oai' as const,
    description: getImageGenDescription(),
    schema: z.object({
      prompt: z.string().max(32000).describe(getImageGenPromptDescription()),
      background: z
        .enum(['transparent', 'opaque', 'auto'])
        .optional()
        .describe(
          'Sets transparency for the background. Must be one of transparent, opaque or auto (default). When transparent, the output format should be png or webp.',
        ),
      /*
        n: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('The number of images to generate. Must be between 1 and 10.'),
        output_compression: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe('The compression level (0-100%) for webp or jpeg formats. Defaults to 100.'),
           */
      quality: z
        .enum(['auto', 'high', 'medium', 'low'])
        .optional()
        .describe('The quality of the image. One of auto (default), high, medium, or low.'),
      size: z
        .enum(['auto', '1024x1024', '1536x1024', '1024x1536'])
        .optional()
        .describe(
          'The size of the generated image. One of 1024x1024, 1536x1024 (landscape), 1024x1536 (portrait), or auto (default).',
        ),
    }),
    responseFormat: 'content_and_artifact' as const,
  } as const,
  image_edit_oai: {
    name: 'image_edit_oai' as const,
    description: getImageEditDescription(),
    schema: z.object({
      image_ids: z
        .array(z.string())
        .min(1)
        .describe(
          `
IDs (image ID strings) of previously generated or uploaded images that should guide the edit.

Guidelines:
- If the user's request depends on any prior image(s), copy their image IDs into the \`image_ids\` array (in the same order the user refers to them).  
- Never invent or hallucinate IDs; only use IDs that are still visible in the conversation context.
- If no earlier image is relevant, omit the field entirely.
`.trim(),
        ),
      prompt: z.string().max(32000).describe(getImageEditPromptDescription()),
      /*
        n: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('The number of images to generate. Must be between 1 and 10. Defaults to 1.'),
        */
      quality: z
        .enum(['auto', 'high', 'medium', 'low'])
        .optional()
        .describe(
          'The quality of the image. One of auto (default), high, medium, or low. High/medium/low only supported for gpt-image-1.',
        ),
      size: z
        .enum(['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512'])
        .optional()
        .describe(
          'The size of the generated images. For gpt-image-1: auto (default), 1024x1024, 1536x1024, 1024x1536. For dall-e-2: 256x256, 512x512, 1024x1024.',
        ),
    }),
    responseFormat: 'content_and_artifact' as const,
  },
} as const;
