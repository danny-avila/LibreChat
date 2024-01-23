const path = require('path');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const { Tool } = require('langchain/tools');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { getImageBasename } = require('~/server/services/Files/images');
const { processFileURL } = require('~/server/services/Files/process');
const extractBaseURL = require('~/utils/extractBaseURL');
const { logger } = require('~/config');

const {
  DALLE2_SYSTEM_PROMPT,
  DALLE_REVERSE_PROXY,
  PROXY,
  DALLE2_AZURE_API_VERSION,
  DALLE2_BASEURL,
  DALLE2_API_KEY,
  DALLE_API_KEY,
} = process.env;
class OpenAICreateImage extends Tool {
  constructor(fields = {}) {
    super();

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;
    let apiKey = fields.DALLE2_API_KEY ?? fields.DALLE_API_KEY ?? this.getApiKey();

    const config = { apiKey };
    if (DALLE_REVERSE_PROXY) {
      config.baseURL = extractBaseURL(DALLE_REVERSE_PROXY);
    }

    if (DALLE2_AZURE_API_VERSION && DALLE2_BASEURL) {
      config.baseURL = DALLE2_BASEURL;
      config.defaultQuery = { 'api-version': DALLE2_AZURE_API_VERSION };
      config.defaultHeaders = { 'api-key': DALLE2_API_KEY, 'Content-Type': 'application/json' };
      config.apiKey = DALLE2_API_KEY;
    }

    if (PROXY) {
      config.httpAgent = new HttpsProxyAgent(PROXY);
    }

    this.openai = new OpenAI(config);
    this.name = 'dall-e';
    this.description = `You can generate images with 'dall-e'. This tool is exclusively for visual content.
Guidelines:
- Visually describe the moods, details, structures, styles, and/or proportions of the image. Remember, the focus is on visual attributes.
- Craft your input by "showing" and not "telling" the imagery. Think in terms of what you'd want to see in a photograph or a painting.
- It's best to follow this format for image creation. Come up with the optional inputs yourself if none are given:
"Subject: [subject], Style: [style], Color: [color], Details: [details], Emotion: [emotion]"
- Generate images only once per human query unless explicitly requested by the user`;
    this.description_for_model =
      DALLE2_SYSTEM_PROMPT ??
      `// Whenever a description of an image is given, generate prompts (following these rules), and use dalle to create the image. If the user does not ask for a specific number of images, default to creating 2 prompts to send to dalle that are written to be as diverse as possible. All prompts sent to dalle must abide by the following policies:
// 1. Prompts must be in English. Translate to English if needed.
// 2. One image per function call. Create only 1 image per request unless explicitly told to generate more than 1 image.
// 3. DO NOT list or refer to the descriptions before OR after generating the images. They should ONLY ever be written out ONCE, in the \`"prompts"\` field of the request. You do not need to ask for permission to generate, just do it!
// 4. Always mention the image type (photo, oil painting, watercolor painting, illustration, cartoon, drawing, vector, render, etc.) at the beginning of the caption. Unless the captions suggests otherwise, make one of the images a photo.
// 5. Diversify depictions of ALL images with people to always include always DESCENT and GENDER for EACH person using direct terms. Adjust only human descriptions.
// - EXPLICITLY specify these attributes, not abstractly reference them. The attributes should be specified in a minimal way and should directly describe their physical form.
// - Your choices should be grounded in reality. For example, all of a given OCCUPATION should not be the same gender or race. Additionally, focus on creating diverse, inclusive, and exploratory scenes via the properties you choose during rewrites.  Make choices that may be insightful or unique sometimes.
// - Use "various" or "diverse" ONLY IF the description refers to groups of more than 3 people. Do not change the number of people requested in the original description.
// - Don't alter memes, fictional character origins, or unseen people. Maintain the original prompt's intent and prioritize quality.
// The prompt must intricately describe every part of the image in concrete, objective detail. THINK about what the end goal of the description is, and extrapolate that to what would make satisfying images.
// All descriptions sent to dalle should be a paragraph of text that is extremely descriptive and detailed. Each should be more than 3 sentences long.`;
  }

  getApiKey() {
    const apiKey = DALLE2_API_KEY ?? DALLE_API_KEY ?? '';
    if (!apiKey) {
      throw new Error('Missing DALLE_API_KEY environment variable.');
    }
    return apiKey;
  }

  replaceUnwantedChars(inputString) {
    return inputString
      .replace(/\r\n|\r|\n/g, ' ')
      .replace(/"/g, '')
      .trim();
  }

  wrapInMarkdown(imageUrl) {
    return `![generated image](${imageUrl})`;
  }

  async _call(input) {
    const resp = await this.openai.images.generate({
      prompt: this.replaceUnwantedChars(input),
      // TODO: Future idea -- could we ask an LLM to extract these arguments from an input that might contain them?
      n: 1,
      // size: '1024x1024'
      size: '512x512',
    });

    const theImageUrl = resp.data[0].url;

    if (!theImageUrl) {
      throw new Error('No image URL returned from OpenAI API.');
    }

    const imageBasename = getImageBasename(theImageUrl);
    const imageExt = path.extname(imageBasename);

    const extension = imageExt.startsWith('.') ? imageExt.slice(1) : imageExt;
    const imageName = `img-${uuidv4()}.${extension}`;

    logger.debug('[DALL-E-2]', {
      imageName,
      imageBasename,
      imageExt,
      extension,
      theImageUrl,
      data: resp.data[0],
    });

    try {
      const result = await processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: theImageUrl,
        fileName: imageName,
        basePath: 'images',
      });

      this.result = this.wrapInMarkdown(result);
    } catch (error) {
      logger.error('Error while saving the image:', error);
      this.result = `Failed to save the image locally. ${error.message}`;
    }

    return this.result;
  }
}

module.exports = OpenAICreateImage;
