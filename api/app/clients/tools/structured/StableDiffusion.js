// Generates image using stable diffusion webui's api (automatic1111)
const fs = require('fs');
const { z } = require('zod');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { StructuredTool } = require('langchain/tools');
const { logger } = require('~/config');

class StableDiffusionAPI extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'stable-diffusion';
    this.url = fields.SD_WEBUI_URL || this.getServerURL();
    this.description_for_model = `// Generate images and visuals using text.
// Guidelines:
// - ALWAYS use {{"prompt": "7+ detailed keywords", "negative_prompt": "7+ detailed keywords"}} structure for queries.
// - ALWAYS include the markdown url in your final response to show the user: ![caption](/images/id.png)
// - Visually describe the moods, details, structures, styles, and/or proportions of the image. Remember, the focus is on visual attributes.
// - Craft your input by "showing" and not "telling" the imagery. Think in terms of what you'd want to see in a photograph or a painting.
// - Here's an example for generating a realistic portrait photo of a man:
// "prompt":"photo of a man in black clothes, half body, high detailed skin, coastline, overcast weather, wind, waves, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3"
// "negative_prompt":"semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, out of frame, low quality, ugly, mutation, deformed"
// - Generate images only once per human query unless explicitly requested by the user`;
    this.description =
      'You can generate images using text with \'stable-diffusion\'. This tool is exclusively for visual content.';
    this.schema = z.object({
      prompt: z
        .string()
        .describe(
          'Detailed keywords to describe the subject, using at least 7 keywords to accurately describe the image, separated by comma',
        ),
      negative_prompt: z
        .string()
        .describe(
          'Keywords we want to exclude from the final image, using at least 7 keywords to accurately describe the image, separated by comma',
        ),
    });
  }

  replaceNewLinesWithSpaces(inputString) {
    return inputString.replace(/\r\n|\r|\n/g, ' ');
  }

  getMarkdownImageUrl(imageName) {
    const imageUrl = path
      .join(this.relativeImageUrl, imageName)
      .replace(/\\/g, '/')
      .replace('public/', '');
    return `![generated image](/${imageUrl})`;
  }

  getServerURL() {
    const url = process.env.SD_WEBUI_URL || '';
    if (!url) {
      throw new Error('Missing SD_WEBUI_URL environment variable.');
    }
    return url;
  }

  async _call(data) {
    const url = this.url;
    const { prompt, negative_prompt } = data;
    const payload = {
      prompt,
      negative_prompt,
      sampler_index: 'DPM++ 2M Karras',
      cfg_scale: 4.5,
      steps: 22,
      width: 1024,
      height: 1024,
    };
    const response = await axios.post(`${url}/sdapi/v1/txt2img`, payload);
    const image = response.data.images[0];
    const pngPayload = { image: `data:image/png;base64,${image}` };
    const response2 = await axios.post(`${url}/sdapi/v1/png-info`, pngPayload);
    const info = response2.data.info;

    // Generate unique name
    const imageName = `${Date.now()}.png`;
    this.outputPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'client',
      'public',
      'images',
    );
    const appRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', 'client');
    this.relativeImageUrl = path.relative(appRoot, this.outputPath);

    // Check if directory exists, if not create it
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }

    try {
      const buffer = Buffer.from(image.split(',', 1)[0], 'base64');
      await sharp(buffer)
        .withMetadata({
          iptcpng: {
            parameters: info,
          },
        })
        .toFile(this.outputPath + '/' + imageName);
      this.result = this.getMarkdownImageUrl(imageName);
    } catch (error) {
      logger.error('[StableDiffusion] Error while saving the image:', error);
      // this.result = theImageUrl;
    }

    return this.result;
  }
}

module.exports = StableDiffusionAPI;
