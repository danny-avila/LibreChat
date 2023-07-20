// Generates image using stable diffusion webui's api (automatic1111)
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Tool } = require('langchain/tools');
const { z } = require('zod');

const RUNPOD_IMG_MODELS = {
  STABLE_DIFFUSION_V1: 'stable-diffusion-v1',
  STABLE_DIFFUSION_V2: 'stable-diffusion-v2',
  ANYTHING_V3: 'sd-anything-v3',
  ANYTHING_V4: 'sd-anything-v4',
  OPENJOURNEY: 'sd-openjourney',
  DREAMBOOTH: 'dream-booth-v1',
  KANDINSKY_2: 'kandinsky-21'
};
const NSFW = ' nsfw';
const MAX_WIDTH = 768;
const MAX_HEIGHT = 768;

class RundPodImgEndpointAPI extends Tool {
  constructor(fields) {
    super();
    console.log('fields', fields);
    this.name = 'runpod-endpoint';
    this.runPodEnabled = this.getRudPodEnabled();
    this.url = fields.RUNPOD_ENDPOINT_URL || this.getServerURL();
    this.apiKey = fields.RUNPOD_API_KEY || this.getApiKey();
    this.useSync = fields.RUNPOD_USE_SYNC || this.getRunPodUseSync();
    this.headers = this.getHeaders(this.apiKey);
    this.description = `You can generate images with 'runpod-endpoint'. This tool is exclusively for visual content.
Guidelines:
- Visually describe the moods, details, structures, styles, and/or proportions of the image. Remember, the focus is on visual attributes.
- Craft your input by "showing" and not "telling" the imagery. Think in terms of what you'd want to see in a photograph or a painting.
- It's best to follow this format for image creation:
"detailed keywords to describe the subject, separated by comma | keywords we want to exclude from the final image"
- Here's an example prompt for generating a realistic portrait photo of a man:
"photo of a man in black clothes, half body, high detailed skin, coastline, overcast weather, wind, waves, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3 | semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, out of frame, low quality, ugly, mutation, deformed"
- Generate images only once per human query unless explicitly requested by the user`;
    this.schema = z.object({
      model: z
        .string(Object.values(RUNPOD_IMG_MODELS))
        .describe(
          'Model to use for image generation, which can only be one of [Stable Diffusion v1 (stable-diffusion-v1), Stable Diffusion v2 (stable-diffusion-v2), Anything v3 (sd-anything-v3), Anything v4 (sd-anything-v4), Openjourney (sd-openjourney), DreamBooth (dream-booth-v1), Kandinsky 2.1 (kandinsky-v2)], defaults to stable-diffusion-v1'
        ),
      width: z
        .number()
        .int()
        .describe(
          'Width of the generated image, Options: 128, 256, 384, 448, 512, 576, 640, 704, 768, defaults to 512, if over 768 then set to 768'
        ),
      height: z
        .number()
        .int()
        .describe(
          'Height of the generated image, Options: 128, 256, 384, 448, 512, 576, 640, 704, 768, defaults to 512, if over 768 then set to 768'
        ),
      init_image: z
        .string()
        .url()
        .optional()
        .describe(
          'URL for an initial image to generate variations of. Will be resized to the specific width and height'
        ),
      mask: z
        .string()
        .url()
        .optional()
        .describe(
          'URL of a black and white image to use as a mask for inpainting over init_image. Black pixels are inpainted and white pixels are preserved'
        ),
      guidance_scale: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe('Scale for classifier-free guidance. Rage 1 - 20. Defaults to 7.5'),
      num_inference_steps: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('The number of denoising steps. Range 1 - 500. Defaults to 20'),
      scheduler: z
        .string()
        .optional()
        .describe(
          'Choose a scheduler. Options: GGIM, DDPM, DPM-M, DPM-S, EULER-A, EULER-D, HEUN, IPNDM, KDPM2-A, KDPM2-D, PNDM, KLMS; DDIM, K-LMS, PNDM. Defaults to KLMS'
        ),
      seed: z.number().int().optional().describe('Random seed, of type int32'),
      prompt_strength: z
        .number()
        .min(0.0)
        .max(1.0)
        .optional()
        .describe('How much importance is given to the prompt. Range: 0.0 - 1.0. Defaults to 1.0'),
      prompt: z
        .string()
        .describe(
          'Detailed keywords to describe the subject, using at least 7 keywords to accurately describe the image, separated by comma'
        ),
      negative_prompt: z
        .string()
        .describe(
          'Keywords we want to exclude from the final image, using at least 7 keywords to accurately describe the image, separated by comma, always append "nsfw" with high weight to the end of the prompt'
        ),
      negative_prior_prompt: z
        .string()
        .optional()
        .describe(
          'Only for kandinsky-v2 model. This parameter is used to guide the decoder network of the model. It provides more specific guidance on what elements or features should be avoided in the image. Separated by comma'
        ),
      negative_decoder_prompt: z
        .string()
        .optional()
        .describe(
          'Only for kandinsky-v2 model. This parameter is used to guide the decoder network of the model. It provides more specific guidance on what elements or features should be avoided in the image. Separated by comma'
        ),
      prior_cf_scale: z
        .number()
        .optional()
        .describe(
          'Only for kandinsky-v2 model. The scaling factor for the prior counterfactual term in the model. This term helps the model generate images that are consistent with the prior distribution. Defaults to 4'
        ),
      prior_steps: z
        .number()
        .int()
        .optional()
        .describe(
          'Only for kandinsky-v2 model. The number of steps taken by the prior model during the inference process. A higher number of prior steps may result in more refined output images, but it can also increase the computation time. Defaults to 5'
        )
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
    const url = process.env.RUNPOD_ENDPOINT_URL || '';
    if (!url) {
      throw new Error('Missing RUNPOD_ENDPOINT_URL environment variable.');
    }
    return url;
  }

  getRunPodUseSync() {
    const flag = process.env.RUNPOD_USE_SYNC;
    if (flag && flag === 'true') {
      return true;
    }
    return false;
  }

  getRudPodEnabled() {
    const flag = process.env.RUNPOD_ENABLED;
    if (flag && flag === 'true') {
      return true;
    }
    return false;
  }

  getApiKey() {
    const key = process.env.RUNPOD_API_KEY || '';
    if (!key) {
      throw new Error('Missing RUNPOD_API_KEY environment variable.');
    }
    return key;
  }

  getHeaders(apiKey) {
    const headers = apiKey
      ? {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      }
      : {};
    return headers;
  }

  // exclude status retrieval url
  getTxt2ImgUrl(url, model) {
    return `${url}/${model}/${
      !this.useSync || model === RUNPOD_IMG_MODELS.DREAMBOOTH ? 'run' : 'runsync'
    }`;
  }

  getTxt2ImgHeaders() {
    return this.headers;
  }

  getTxt2ImgPayload(prompts, model) {
    const prompt = prompts.prompt;
    const negative_prompt = (prompts.negative_prompt || '') + NSFW;
    // if height is over MAX_height, set to MAX_height
    const height = Math.min(prompts.height || 512, MAX_HEIGHT);
    const width = Math.min(prompts.width || 512, MAX_WIDTH);
    if (
      model === RUNPOD_IMG_MODELS.ANYTHING_V3 ||
      model === RUNPOD_IMG_MODELS.ANYTHING_V4 ||
      model === RUNPOD_IMG_MODELS.OPENJOURNEY
    )
      return {
        input: {
          prompt: prompt,
          negative_prompt: negative_prompt,
          height: height,
          width: width,
          num_outputs: 1,
          num_inference_steps: 20,
          guidance_scale: prompts.guidance_scale || 7.5,
          init_image: prompts.init_image || '',
          mask: prompts.mask || '',
          prompt_strength: prompts.prompt_strength || 0.8,
          scheduler: prompts.scheduler || 'K-LMS'
        }
      };
    else if (model === RUNPOD_IMG_MODELS.KANDINSKY_2)
      return {
        input: {
          prompt: prompt,
          negative_prompt: negative_prompt,
          negative_prior_prompt: prompts.negative_prior_prompt || '',
          negative_decoder_prompt: prompts.negative_decoder_prompt || '',
          h: height,
          w: width,
          sampler: 'ddim',
          num_images: 1,
          num_steps: prompts.num_inference_steps || 100,
          prior_steps: prompts.prior_steps || 5,
          prior_cf_scale: prompts.prior_cf_scale || 4,
          guidance_scale: prompts.guidance_scale || 4,
          seed: prompts.seed || -1
        }
      };
    else if (model === RUNPOD_IMG_MODELS.STABLE_DIFFUSION_V2)
      return {
        input: {
          prompt: prompt,
          negative_prompt: negative_prompt,
          height: height,
          width: width,
          num_outputs: 1,
          num_inference_steps: 20,
          guidance_scale: prompts.guidance_scale || 7.5,
          scheduler: prompts.scheduler || 'KLMS'
        }
      };
    // default RUNPOD_IMG_MODELS.STABLE_DIFFUSION_V1
    else
      return {
        input: {
          prompt: prompt,
          negative_prompt: negative_prompt,
          height: height,
          width: width,
          num_outputs: 1,
          num_inference_steps: 20,
          init_image: prompts.init_image || '',
          mask: prompts.mask || '',
          guidance_scale: prompts.guidance_scale || 7.5,
          prompt_strength: prompts.prompt_strength || 1,
          scheduler: prompts.scheduler || 'KLMS'
        }
      };
    // TODO: DREAMBOOTH should be separate plugin due to unpredictable cost
  }

  getStatusUrl(url, model, jobId) {
    return `${url}/${model}}/status/${jobId}`;
  }

  async _call(input) {
    if (!this.runPodEnabled) {
      return 'Txt2Img is not enabled.';
    }
    const url = this.url;
    const model =
      input && input.model && Object.values(RUNPOD_IMG_MODELS).includes(input.model)
        ? input.model
        : RUNPOD_IMG_MODELS.STABLE_DIFFUSION_V1;
    // todo: dreambooth will be supported later but in another plugin
    if (model === RUNPOD_IMG_MODELS.DREAMBOOTH) {
      console.log(
        'Dreambooth is not supported yet. Please wait for another specific plugin for dreambooth.'
      );
      return '![unavailable image](https://i.imgur.com/2Yj2Q2U.png)';
    }

    const response = await axios.post(
      this.getTxt2ImgUrl(url, model),
      this.getTxt2ImgPayload(input, model),
      { headers: this.getTxt2ImgHeaders() }
    );
    console.log('runpod response', response.data);
    //TODO: run vs runsync
    let rst = '' | undefined;
    if (response.status === 200) {
      if (response.data && response.data.output) {
        rst = response.data.output[0].image;
      } else {
        // just id and status
        return 'Txt2Img server is busy. please try again later.'
      }
    } else {
      return 'Txt2Img server is busy. please try again later.'
    }

    // Generate unique name
    const imageName = `${Date.now()}.png`;
    this.outputPath = path.resolve(__dirname, '..', '..', '..', '..', 'client', 'public', 'images');
    const appRoot = path.resolve(__dirname, '..', '..', '..', '..', 'client');
    this.relativeImageUrl = path.relative(appRoot, this.outputPath);

    // Check if directory exists, if not create it
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }

    try {
      const filepath = this.outputPath + '/' + imageName;
      downloadImage(rst, filepath);
      this.result = this.getMarkdownImageUrl(imageName);
    } catch (error) {
      console.error('Error while saving the image:', error);
    }

    return this.result;
  }
}

async function downloadImage(imageUrl, filePath) {
  try {
    const response = await axios({
      method: 'get',
      url: imageUrl,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(error);
  }
}

module.exports = RundPodImgEndpointAPI;
